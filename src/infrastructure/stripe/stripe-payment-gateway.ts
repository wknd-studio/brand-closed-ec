import { getStripe } from "@/infrastructure/stripe/client";
import type {
  PaymentGateway,
  CheckoutLineItem,
  CheckoutSession,
} from "@/repositories/payment-gateway";
import type { Order } from "@/domain/entities/order";

const CHECKOUT_SESSION_EXPIRES_IN_SECONDS = 31 * 60;

// 商品代金の支払い手段はカード（Link で保存したカードを含む）だけ。
// 指定しないとダッシュボードの支払い手段の設定で決まり、コンビニ払い等が有効になると
// 画面・特商法の表記の「カードのみ」と食い違うため、コードで指定する（#809）
const PAYMENT_METHOD_TYPES: ("card" | "link")[] = ["card", "link"];

export class StripePaymentGateway implements PaymentGateway {
  async createCheckoutSession(
    order: Order,
    lineItems: CheckoutLineItem[],
    baseUrl: string
  ): Promise<CheckoutSession> {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: PAYMENT_METHOD_TYPES,
        customer_email: undefined,
        line_items: lineItems.map((i) => ({
          price_data: {
            currency: "jpy",
            unit_amount: i.unitPrice,
            product_data: { name: i.productName },
          },
          quantity: i.quantity,
        })),
        success_url: `${baseUrl}/order/complete?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/order/checkout`,
        metadata: { order_id: order.id },
        // 決済されずに放置されたセッションを失効させ、checkout.session.expired で決済単位をキャンセルする（#202）。
        // Stripeの下限は作成から30分で、リクエストが届くまでの時間で下回らないよう1分の余裕を持たせる
        expires_at:
          Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_EXPIRES_IN_SECONDS,
      },
      { idempotencyKey: `checkout-session-${order.id}` }
    );

    return { sessionId: session.id, url: session.url! };
  }

  async createInvoiceForOrder(
    order: Order,
    stripeCustomerId: string
  ): Promise<string> {
    const invoice = await getStripe().invoices.create(
      {
        customer: stripeCustomerId,
        collection_method: "send_invoice",
        days_until_due: 7,
        payment_settings: { payment_method_types: PAYMENT_METHOD_TYPES },
        metadata: { order_id: order.id },
      },
      { idempotencyKey: `invoice-${order.id}` }
    );

    for (const item of order.items) {
      const unitPrice = item.negotiatedUnitPrice ?? item.unitPriceSnapshot;
      await getStripe().invoiceItems.create(
        {
          customer: stripeCustomerId,
          invoice: invoice.id,
          description: item.productNameSnapshot,
          amount: unitPrice.amount * item.quantity,
          currency: "jpy",
        },
        { idempotencyKey: `invoice-item-${order.id}-${item.id}` }
      );
    }

    await getStripe().invoices.finalizeInvoice(invoice.id);
    await getStripe().invoices.sendInvoice(invoice.id);

    return invoice.id;
  }
}
