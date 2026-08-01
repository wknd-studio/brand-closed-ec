import { checkMonthlyLimit } from "@/domain/services/monthly-limit-service";
import { selectOrderFlow } from "@/domain/services/order-flow-selector";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import type { UserRepository } from "@/repositories/user-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { AddressRepository } from "@/repositories/address-repository";
import type { ProductRepository } from "@/repositories/product-repository";
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
    });
  });

  const period = user.getMonthlyPeriod();
  const confirmedAmount = await orderRepo.sumConfirmedAmountByUserId(
    user.id,
    period
  );
  checkMonthlyLimit(user, cartItems, Money.of(confirmedAmount));

  const paymentFlow = selectOrderFlow(cartItems);

  const [shippingAddress, billingAddress] = await Promise.all([
    addressRepo.findById(input.shippingAddressId),
    addressRepo.findById(input.billingAddressId),
  ]);
  if (!shippingAddress || !billingAddress)
    throw new Error("住所が見つかりません");

  const orderId = crypto.randomUUID();
  const initialStatus = OrderStatus.of(
    paymentFlow === "checkout" ? "pending_payment" : "confirming"
  );

  const orderItems = input.cartItems.map((c) => {
    const product = products.find(
      (p) => p.sanityProductId === c.sanityProductId
    );
    return OrderItem.of({
      id: crypto.randomUUID(),
      sanityProductId: c.sanityProductId,
      productNameSnapshot: product?.productName ?? c.productName,
      unitPriceSnapshot: product?.isNegotiable
        ? Money.zero()
        : (product?.unitPrice ?? Money.zero()),
      quantity: c.quantity,
      isNegotiable: product?.isNegotiable ?? false,
      negotiatedUnitPrice: null,
    });
  });

  const order = Order.of({
    id: orderId,
    userId: user.id,
    paymentFlow,
    status: initialStatus,
    shippingAddress: shippingAddress.toSnapshot(),
    billingAddress: billingAddress.toSnapshot(),
    rankAtOrder: user.rank,
    monthlyLimitAtOrder: user.getMonthlyLimit(),
    stripeCheckoutSessionId: null,
    stripeInvoiceId: null,
    items: orderItems,
    createdAt: new Date(),
  });

  await orderRepo.save(order);

  if (paymentFlow === "checkout") {
    const lineItems: CheckoutLineItem[] = cartItems.map((c) => ({
      productName: c.productName,
      unitPrice: c.unitPrice.amount,
      quantity: c.quantity,
    }));
    const session = await paymentGateway.createCheckoutSession(
      order,
      lineItems,
      input.baseUrl
    );
    await orderRepo.save(
      order.with({ stripeCheckoutSessionId: session.sessionId })
    );
    return { redirectUrl: session.url };
  } else {
    await Promise.all([
      notificationService.sendOrderConfirming(order, user, products),
      notificationService.sendOrderOperatorNotification(
        order,
        user.email,
        products
      ),
    ]);
    return { redirectUrl: `/order/invoice-complete?order_id=${orderId}` };
  }
}
