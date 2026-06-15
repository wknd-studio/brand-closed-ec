import type { Order } from "@/domain/entities/order";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByStripeCheckoutSessionId(sessionId: string): Promise<Order | null>;
  findByStripeInvoiceId(invoiceId: string): Promise<Order | null>;

  /** 月次上限チェック用: 当月の確定済み注文の固定合計金額を集計 */
  sumConfirmedAmountByUserId(
    userId: string,
    period: MonthlyPeriod
  ): Promise<number>;

  save(order: Order): Promise<void>;
}
