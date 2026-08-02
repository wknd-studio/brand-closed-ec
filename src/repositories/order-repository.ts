import type { Order } from "@/domain/entities/order";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

export type OrderWithUser = {
  id: string;
  createdAt: Date;
  status: string;
  paymentFlow: "checkout" | "invoice";
  splitGroupId: string | null;
  user: {
    lastName: string;
    firstName: string;
    email: string;
    stripeCustomerId: string | null;
  } | null;
  items: {
    id: string;
    productNameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: number | null;
    isNegotiable: boolean;
  }[];
};

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

  /** チェックアウト分割によって関連付けられたOrderを全件取得 */
  findBySplitGroupId(splitGroupId: string): Promise<Order[]>;

  /**
   * Orderを物理削除する。分割チェックアウトでOrder A・Order Bの一方の保存が
   * 失敗した場合の補償処理（compensating delete）専用。通常のキャンセル等では
   * 使用しない（既存通りstatusの更新を使う）
   */
  delete(orderId: string): Promise<void>;

  /** 退会ゲートチェック用: ユーザーの非ターミナル注文（進行中）を取得 */
  findActiveByUserId(userId: string): Promise<Order[]>;

  /** 管理画面用: アクティブな注文一覧をユーザー情報込みで取得 */
  findActiveOrdersWithUser(): Promise<OrderWithUser[]>;

  /** 管理画面用: 注文詳細をユーザー情報・アイテム込みで取得 */
  findByIdWithUser(orderId: string): Promise<OrderWithUser | null>;
}
