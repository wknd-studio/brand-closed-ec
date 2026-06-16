import type { Order } from "@/domain/entities/order";

export interface CheckoutLineItem {
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface PaymentGateway {
  createCheckoutSession(
    order: Order,
    lineItems: CheckoutLineItem[],
    baseUrl: string
  ): Promise<CheckoutSession>;

  createInvoiceForOrder(
    order: Order,
    stripeCustomerId: string
  ): Promise<string>;

  ensureCustomer(email: string, userId: string): Promise<string>;
}
