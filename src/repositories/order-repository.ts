import type { Order } from "@/domain/entities/order";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

export type OrderWithUser = {
  id: string;
  createdAt: Date;
  status: string;
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
    paymentTiming: "at_order" | "after_order";
    settlementId: string | null;
  }[];
  settlements: {
    id: string;
    flow: "checkout" | "invoice";
    status: string;
    amount: number;
    stripeCheckoutSessionId: string | null;
    stripeInvoiceId: string | null;
  }[];
};

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  /** 指定したCheckout Session IDの決済単位を持つ注文を返す */
  findByStripeCheckoutSessionId(sessionId: string): Promise<Order | null>;
  /** 指定したInvoice IDの決済単位を持つ注文を返す */
  findByStripeInvoiceId(invoiceId: string): Promise<Order | null>;

  /**
   * 月次上限チェック用: 当月に確定している金額を明細単位で集計する。
   * 対象は「注文がキャンセルされておらず、明細の決済単位もキャンセルされていない」明細
   * （決済単位が未作成の後払い明細も含む）。docs/domain/settlement.md参照
   */
  sumConfirmedAmountByUserId(
    userId: string,
    period: MonthlyPeriod
  ): Promise<number>;

  /** 注文・明細・決済単位を保存する（既存があれば更新） */
  save(order: Order): Promise<void>;

  /**
   * Orderを明細・決済単位ごと物理削除する。注文確定処理の途中失敗時の
   * 補償処理（compensating delete）専用。通常のキャンセル等では
   * 使用しない（statusの更新を使う）
   */
  delete(orderId: string): Promise<void>;

  /** 退会ゲートチェック用: ユーザーのキャンセルされていない注文（進行中）を取得 */
  findActiveByUserId(userId: string): Promise<Order[]>;

  /** 管理画面用: アクティブな注文一覧をユーザー情報込みで取得 */
  findActiveOrdersWithUser(): Promise<OrderWithUser[]>;

  /** 管理画面用: 注文詳細をユーザー情報・アイテム・決済単位込みで取得 */
  findByIdWithUser(orderId: string): Promise<OrderWithUser | null>;
}
