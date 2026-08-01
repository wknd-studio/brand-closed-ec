import { checkMonthlyLimit } from "@/domain/services/monthly-limit-service";
import { splitCartByPaymentTiming } from "@/domain/services/order-flow-selector";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
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
      paymentTiming: product?.paymentTiming ?? "after_order",
    });
  });

  const period = user.getMonthlyPeriod();
  const confirmedAmount = await orderRepo.sumConfirmedAmountByUserId(
    user.id,
    period
  );
  // 月次上限チェックは分割前のカート合計に対して1回だけ判定する（超過時はCheckout・Invoice両方をブロック）
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

  const toOrderItems = (items: CartItem[]): OrderItem[] =>
    items.map((c) =>
      OrderItem.of({
        id: crypto.randomUUID(),
        sanityProductId: c.sanityProductId,
        productNameSnapshot: c.productName,
        unitPriceSnapshot: c.unitPrice,
        quantity: c.quantity,
        isNegotiable: c.isNegotiable,
        negotiatedUnitPrice: null,
      })
    );

  const isSplit = atOrderItems.length > 0 && afterOrderItems.length > 0;
  const splitGroupId = isSplit ? crypto.randomUUID() : null;

  const buildOrder = (
    paymentFlow: "checkout" | "invoice",
    items: OrderItem[]
  ): Order =>
    Order.of({
      id: crypto.randomUUID(),
      userId: user.id,
      paymentFlow,
      status: OrderStatus.of(
        paymentFlow === "checkout" ? "pending_payment" : "confirming"
      ),
      shippingAddress: shippingAddress.toSnapshot(),
      billingAddress: billingAddress.toSnapshot(),
      rankAtOrder: user.rank,
      monthlyLimitAtOrder: user.getMonthlyLimit(),
      stripeCheckoutSessionId: null,
      stripeInvoiceId: null,
      splitGroupId,
      items,
      createdAt: new Date(),
    });

  const checkoutOrder =
    atOrderItems.length > 0
      ? buildOrder("checkout", toOrderItems(atOrderItems))
      : null;
  const invoiceOrder =
    afterOrderItems.length > 0
      ? buildOrder("invoice", toOrderItems(afterOrderItems))
      : null;

  const ordersToSave = [checkoutOrder, invoiceOrder].filter(
    (o): o is Order => o !== null
  );
  await saveOrdersAtomically(ordersToSave, orderRepo);

  const productsForOrder = (order: Order): ProductSnapshot[] => {
    const ids = new Set(order.items.map((i) => i.sanityProductId));
    return products.filter((p) => ids.has(p.sanityProductId));
  };

  const notifyInvoiceOrder = async (order: Order) => {
    await Promise.all([
      notificationService.sendOrderConfirming(
        order,
        user,
        productsForOrder(order)
      ),
      notificationService.sendOrderOperatorNotification(
        order,
        user.email,
        productsForOrder(order)
      ),
    ]);
  };

  if (checkoutOrder) {
    const lineItems: CheckoutLineItem[] = atOrderItems.map((c) => ({
      productName: c.productName,
      unitPrice: c.unitPrice.amount,
      quantity: c.quantity,
    }));
    const session = await paymentGateway.createCheckoutSession(
      checkoutOrder,
      lineItems,
      input.baseUrl
    );
    await orderRepo.save(
      checkoutOrder.with({ stripeCheckoutSessionId: session.sessionId })
    );

    if (invoiceOrder) {
      await notifyInvoiceOrder(invoiceOrder);
    }

    return { redirectUrl: session.url };
  }

  // ここに到達する場合、afterOrderItemsが非空(invoiceOrderが必ず存在)であることが
  // atOrderItems.length === 0 && afterOrderItems.length === 0 が発生しない前提から保証される
  await notifyInvoiceOrder(invoiceOrder!);
  return {
    redirectUrl: `/order/invoice-complete?order_id=${invoiceOrder!.id}`,
  };
}

async function saveOrdersAtomically(
  orders: Order[],
  orderRepo: OrderRepository
): Promise<void> {
  const saved: Order[] = [];
  try {
    for (const order of orders) {
      await orderRepo.save(order);
      saved.push(order);
    }
  } catch (error) {
    await Promise.all(saved.map((order) => orderRepo.delete(order.id)));
    throw error;
  }
}
