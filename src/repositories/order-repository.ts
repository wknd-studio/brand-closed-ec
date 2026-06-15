import type { Order, PaymentFlow } from "@/domain/entities/order";
import type { OrderItem } from "@/domain/entities/order-item";
import type { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import type { MemberRank } from "@/domain/value-objects/member-rank";
import type { Money } from "@/domain/value-objects/money";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

export interface CreateOrderParams {
  userId: string;
  paymentFlow: PaymentFlow;
  rankAtOrder: MemberRank;
  monthlyLimitAtOrder: Money;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  stripeCheckoutSessionId: string | null;
  items: Omit<OrderItem, "id">[];
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByStripeCheckoutSessionId(sessionId: string): Promise<Order | null>;
  findByStripeInvoiceId(invoiceId: string): Promise<Order | null>;

  /** 月次上限チェック用: 当月の確定済み注文の固定合計金額を集計 */
  sumConfirmedAmountByUserId(
    userId: string,
    period: MonthlyPeriod
  ): Promise<number>;

  create(params: CreateOrderParams): Promise<Order>;
  save(order: Order): Promise<void>;
}
