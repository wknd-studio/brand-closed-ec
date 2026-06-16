import type { Order } from "@/domain/entities/order";
import type { ProductSnapshot } from "./product-repository";

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
    stripeCustomerId: string,
    lineItems: ProductSnapshot[]
  ): Promise<string>;

  ensureCustomer(email: string, userId: string): Promise<string>;
}
