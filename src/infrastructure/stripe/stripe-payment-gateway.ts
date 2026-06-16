import { getStripe } from "@/lib/stripe";
import type {
  PaymentGateway,
  CheckoutLineItem,
  CheckoutSession,
} from "@/repositories/payment-gateway";
import type { Order } from "@/domain/entities/order";

export class StripePaymentGateway implements PaymentGateway {
  async createCheckoutSession(
    order: Order,
    lineItems: CheckoutLineItem[],
    baseUrl: string
  ): Promise<CheckoutSession> {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
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
    });

    return { sessionId: session.id, url: session.url! };
  }

  async ensureCustomer(email: string, userId: string): Promise<string> {
    const customer = await getStripe().customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    return customer.id;
  }

  async createInvoiceForOrder(
    order: Order,
    stripeCustomerId: string
  ): Promise<string> {
    const invoice = await getStripe().invoices.create({
      customer: stripeCustomerId,
      collection_method: "send_invoice",
      days_until_due: 7,
      metadata: { order_id: order.id },
    });

    for (const item of order.items) {
      const unitPrice = item.negotiatedUnitPrice ?? item.unitPriceSnapshot;
      await getStripe().invoiceItems.create({
        customer: stripeCustomerId,
        invoice: invoice.id,
        description: item.productNameSnapshot,
        amount: unitPrice.amount * item.quantity,
        currency: "jpy",
      });
    }

    await getStripe().invoices.finalizeInvoice(invoice.id);
    await getStripe().invoices.sendInvoice(invoice.id);

    return invoice.id;
  }
}
