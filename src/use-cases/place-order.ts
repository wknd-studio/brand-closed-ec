import { checkMonthlyLimit } from "@/domain/services/monthly-limit-service";
import { splitCartByPaymentTiming } from "@/domain/services/order-flow-selector";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderSettlement } from "@/domain/entities/order-settlement";
import type { UserRepository } from "@/repositories/user-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { AddressRepository } from "@/repositories/address-repository";
import type {
  ProductRepository,
  ProductSnapshot,
} from "@/repositories/product-repository";
import type {
  PaymentGateway,
  CheckoutLineItem,
} from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";

export type PlaceOrderInput = {
  clerkUserId: string;
  cartItems: {
    sanityProductId: string;
    quantity: number;
    productName: string;
  }[];
  shippingAddressId: string;
  billingAddressId: string;
  baseUrl: string;
};

export type PlaceOrderDeps = {
  userRepo: UserRepository;
  orderRepo: OrderRepository;
  addressRepo: AddressRepository;
  productRepo: ProductRepository;
  paymentGateway: PaymentGateway;
  notificationService: NotificationService;
};

export async function placeOrder(
  input: PlaceOrderInput,
  deps: PlaceOrderDeps
): Promise<{ redirectUrl: string }> {
  const {
    userRepo,
    orderRepo,
    addressRepo,
    productRepo,
    paymentGateway,
    notificationService,
  } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const productIds = input.cartItems.map((c) => c.sanityProductId);
  const products = await productRepo.findByIds(productIds, user.rank.value);

  // カート情報は会員のブラウザ側で保持・改竄されうるため、価格・支払いタイミング等の
  // 判断材料としては使わず、ここで商品IDごとにサーバー側の商品情報の実在性・アクセス権限を検証する
  for (const c of input.cartItems) {
    const product = products.find(
      (p) => p.sanityProductId === c.sanityProductId
    );
    if (!product) throw new Error("商品が見つかりません");
    if (!user.rank.canAccess(MemberRank.of(product.minRank))) {
      throw new Error("アクセス権限のない商品が含まれています");
    }
  }

  // paymentTimingの分割判定は必ずサーバー側で取得したProductSnapshotの値のみを根拠にする。
  // クライアント入力（cartItems）にpaymentTimingが含まれていても一切参照しない（研究文書 決定9）
  const cartItems = input.cartItems.map((c) => {
    const product = products.find(
      (p) => p.sanityProductId === c.sanityProductId
    );
    return CartItem.of({
      sanityProductId: c.sanityProductId,
      productName: product?.productName ?? c.productName,
      quantity: c.quantity,
      unitPrice: product?.isNegotiable
        ? Money.zero()
        : (product?.unitPrice ?? Money.zero()),
      isNegotiable: product?.isNegotiable ?? false,
      paymentTiming: product?.paymentTiming ?? "at_order",
    });
  });

  const period = user.getMonthlyPeriod();
  const confirmedAmount = await orderRepo.sumConfirmedAmountByUserId(
    user.id,
    period
  );
  // 月次上限チェックはカート全体（at_order・after_order両方）の合計に対して1回だけ判定する
  checkMonthlyLimit(user, cartItems, Money.of(confirmedAmount));

  const { atOrderItems, afterOrderItems } = splitCartByPaymentTiming(cartItems);
  if (atOrderItems.length === 0 && afterOrderItems.length === 0) {
    throw new Error("カートに商品がありません");
  }

  const [shippingAddress, billingAddress] = await Promise.all([
    addressRepo.findById(input.shippingAddressId),
    addressRepo.findById(input.billingAddressId),
  ]);
  if (!shippingAddress || !billingAddress)
    throw new Error("住所が見つかりません");

  // 注文は常に1回のチェックアウト操作＝1件。支払いタイミングが混在していても分割しない
  // （docs/domain/settlement.md）。
  // - at_order: 注文確定と同時にCheckout決済単位を作り、明細を紐付ける
  // - after_order: 決済単位は作らない（settlement_id=NULL）。運営者の「請求作成」で後から紐付く
  const orderId = crypto.randomUUID();
  const settlementId = atOrderItems.length > 0 ? crypto.randomUUID() : null;

  const toOrderItems = (
    items: CartItem[],
    paymentTiming: "at_order" | "after_order",
    itemSettlementId: string | null
  ): OrderItem[] =>
    items.map((c) =>
      OrderItem.of({
        id: crypto.randomUUID(),
        sanityProductId: c.sanityProductId,
        productNameSnapshot: c.productName,
        unitPriceSnapshot: c.unitPrice,
        quantity: c.quantity,
        isNegotiable: c.isNegotiable,
        negotiatedUnitPrice: null,
        paymentTiming,
        settlementId: itemSettlementId,
      })
    );

  const settlement =
    settlementId !== null
      ? OrderSettlement.of({
          id: settlementId,
          orderId,
          flow: "checkout",
          status: "pending_payment",
          stripeCheckoutSessionId: null,
          stripeInvoiceId: null,
          amount: atOrderItems.reduce(
            (sum, c) => sum.add(c.getSubtotal()),
            Money.zero()
          ),
          paidAt: null,
          cancelledAt: null,
        })
      : null;

  const order = Order.of({
    id: orderId,
    userId: user.id,
    status: OrderStatus.of("processing"),
    shippingAddress: shippingAddress.toSnapshot(),
    billingAddress: billingAddress.toSnapshot(),
    rankAtOrder: user.rank,
    monthlyLimitAtOrder: user.getMonthlyLimit(),
    items: [
      ...toOrderItems(atOrderItems, "at_order", settlementId),
      ...toOrderItems(afterOrderItems, "after_order", null),
    ],
    settlements: settlement ? [settlement] : [],
    createdAt: new Date(),
  });

  // 途中で失敗した場合に注文が中途半端に残らないよう、補償削除してからエラーを伝播する
  const deleteOrderQuietly = async () => {
    try {
      await orderRepo.delete(order.id);
    } catch {
      // 補償削除の失敗で元のエラーを隠さない
    }
  };

  try {
    await orderRepo.save(order);
  } catch (error) {
    await deleteOrderQuietly();
    throw error;
  }

  const afterOrderProducts = (): ProductSnapshot[] => {
    const ids = new Set(afterOrderItems.map((i) => i.sanityProductId));
    return products.filter((p) => ids.has(p.sanityProductId));
  };

  const notifyAfterOrderItems = async () => {
    await Promise.all([
      notificationService.sendOrderConfirming(
        order,
        user,
        afterOrderProducts()
      ),
      notificationService.sendOrderOperatorNotification(
        order,
        user.email,
        afterOrderProducts()
      ),
    ]);
  };

  if (settlement) {
    const lineItems: CheckoutLineItem[] = atOrderItems.map((c) => ({
      productName: c.productName,
      unitPrice: c.unitPrice.amount,
      quantity: c.quantity,
    }));

    let session;
    try {
      session = await paymentGateway.createCheckoutSession(
        order,
        lineItems,
        input.baseUrl
      );
    } catch (error) {
      await deleteOrderQuietly();
      throw error;
    }
    await orderRepo.save(
      order.applySettlement(
        settlement.with({ stripeCheckoutSessionId: session.sessionId })
      )
    );

    if (afterOrderItems.length > 0) {
      await notifyAfterOrderItems();
    }

    return { redirectUrl: session.url };
  }

  // ここに到達する場合、atOrderItemsが空のためafterOrderItemsは必ず非空
  // （両方空のケースは上で「カートに商品がありません」としてエラー済み）
  await notifyAfterOrderItems();
  return {
    redirectUrl: `/order/invoice-complete?order_id=${order.id}`,
  };
}
