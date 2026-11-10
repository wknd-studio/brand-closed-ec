import { checkMonthlyLimit } from "@/domain/services/monthly-limit-service";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { Order } from "@/domain/entities/order";
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
import type { ErrorReporter } from "@/repositories/error-reporter";

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
  errorReporter: ErrorReporter;
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
    errorReporter,
  } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  if (input.cartItems.length === 0) throw new Error("カートに商品がありません");

  const productIds = input.cartItems.map((c) => c.sanityProductId);
  const products = await productRepo.findByIds(productIds, user.rank.value);

  // 価格・支払いタイミング等はカートの値を使わず、サーバー側の商品情報から明細を作る。
  // 商品の実在性・ランクによるアクセス権限の検証もCartItem.fromProductsが行う
  const cartItems = CartItem.fromProducts(input.cartItems, products, user.rank);

  const period = user.getMonthlyPeriod();
  const confirmedAmount = await orderRepo.sumConfirmedAmountByUserId(
    user.id,
    period
  );
  // 月次上限チェックはカート全体（at_order・after_order両方）の合計に対して1回だけ判定する
  checkMonthlyLimit(user, cartItems, Money.of(confirmedAmount));

  // 住所IDは画面から送られるため、注文する会員の住所に絞って取る。注文は admin
  // クライアントで組み立てる（RLS が効かない）ので、IDだけで取ると他の会員の住所が
  // 注文のスナップショットに入ってしまう（#619）
  const [shippingAddress, billingAddress] = await Promise.all([
    addressRepo.findByIdAndUserId(input.shippingAddressId, user.id),
    addressRepo.findByIdAndUserId(input.billingAddressId, user.id),
  ]);
  if (!shippingAddress || !billingAddress)
    throw new Error("住所が見つかりません");

  // 明細の分け方・決済単位の作成・金額の計算・初期状態はOrder.placeが決める
  // （docs/domain/settlement.md）
  const order = Order.place({
    user,
    cartItems,
    shippingAddress: shippingAddress.toSnapshot(),
    billingAddress: billingAddress.toSnapshot(),
    placedAt: new Date(),
    generateId: () => crypto.randomUUID(),
  });
  const settlement = order.checkoutSettlement();
  const afterOrderItems = order.items.filter((item) => item.isAfterOrder());

  // 途中で失敗した場合に注文が中途半端に残らないよう、補償削除してからエラーを伝播する
  const deleteOrderQuietly = async (cause: unknown) => {
    try {
      await orderRepo.delete(order.id);
    } catch (deleteError) {
      // 補償削除自体の失敗は、孤児化した注文が残っていることに誰も気づけなくなる
      // ため、元のエラーとは別にErrorReporterで通知する（docs/ai-prompts/sentry.md、issue #272）
      errorReporter.captureException(deleteError, {
        tags: { useCase: "placeOrder", step: "compensatingDelete" },
        extra: { orderId: order.id, cause },
      });
      console.error(
        `[placeOrder] 補償削除に失敗しました。注文${order.id}が孤児化している可能性があります:`,
        deleteError
      );
    }
  };

  // 月次上限チェック（行ロック込み）と注文・明細・決済単位の保存を、
  // 1回のDB呼び出し（RPC）でアトミックに行う（issue #220・#267）。関数はPostgresの
  // トランザクション内で完結するため、失敗時（上限超過含む）は何も保存されず、
  // 補償削除は不要
  await orderRepo.saveNewOrderWithLimitCheck(
    order,
    period,
    user.getMonthlyLimit(),
    order.getFixedTotal()
  );

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
    const lineItems: CheckoutLineItem[] = order
      .itemsIn(settlement)
      .map((item) => ({
        productName: item.productNameSnapshot,
        unitPrice: item.unitPriceSnapshot.amount,
        quantity: item.quantity,
      }));

    let session;
    try {
      session = await paymentGateway.createCheckoutSession(
        order,
        lineItems,
        input.baseUrl
      );
    } catch (error) {
      await deleteOrderQuietly(error);
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

  // ここに到達する場合、決済単位が無いためafterOrderItemsは必ず非空
  // （明細が空の注文はOrder.placeが作らない）
  await notifyAfterOrderItems();
  return {
    redirectUrl: `/order/invoice-complete?order_id=${order.id}`,
  };
}
