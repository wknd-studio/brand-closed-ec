import type { InvoiceSettlementDraft, Order } from "@/domain/entities/order";
import type { Money } from "@/domain/value-objects/money";
import type { OrderNumber } from "@/domain/value-objects/order-number";
import type { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import type { SettlementStatus } from "@/domain/entities/order-settlement";

export type OrderWithUser = {
  id: string;
  orderNumber: OrderNumber;
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

/** 請求作成で作られた決済単位の状態。上限超過なら Stripe Invoice を発行しない */
export type InvoiceSettlementCreated = Extract<
  SettlementStatus,
  "invoice_sent" | "limit_exceeded"
>;

/**
 * orders.status を変えた主体（order_status_changes.changed_by）。
 * 運営者の操作では、誰が変えたかを admin_users.id で、なぜ変えたかを reason で残す
 * （理由の入力は任意のため、無ければ null。#271）
 */
export type OrderStatusChangedBy =
  | { type: "customer" }
  | { type: "system" }
  | { type: "admin"; adminUserId: string; reason: string | null };

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

  /**
   * 注文・明細・決済単位を1つのトランザクションで保存する（既存があれば更新）。
   * orders.status が変わったときだけ、changedBy を主体として order_status_changes に
   * 1行記録する（状態の更新と履歴は両方とも反映されるか、両方とも反映されない。#237）。
   * order.version（読んだ時点の版）から、DBの注文が別の書き手に変えられていれば、何も保存せずに
   * OrderConcurrentlyModifiedError を投げる（楽観ロック。#721）。読み直してやり直すかは呼び出し側が決める。
   * 新しい注文の作成には使わない（saveNewOrderWithLimitCheck を使う）。まだ行の無い注文はロックする行が
   * 無いため、同じ注文を同時に作ると版の確認をすり抜けて後の保存が先の保存を上書きする
   */
  save(order: Order, changedBy: OrderStatusChangedBy): Promise<void>;

  /**
   * 注文（+明細+決済単位）を新規作成する。対象ユーザー行への行ロック込みで
   * 月次上限チェックと保存を1回のDB呼び出しでアトミックに行い、同一顧客の
   * 同時注文による上限超過を防ぐ（issue #220・#267、docs/domain/settlement.md
   * 「同一顧客の同時注文による競合の防止・完全排除」参照）。
   * 超過時はLimitExceededErrorを投げ、何も保存しない
   */
  saveNewOrderWithLimitCheck(
    order: Order,
    period: MonthlyPeriod,
    // 無制限なら上限の判定をしない
    monthlyLimit: MonthlyLimit,
    cartFixedTotal: Money
  ): Promise<void>;

  /**
   * 請求作成: Order.draftInvoiceSettlement() で組み立てた請求を保存する。対象ユーザー行への行ロック込みで
   * 月次上限チェックと保存を1回のDB呼び出しで行い、同じ顧客の注文確定・請求作成と直列化する
   * （issue #393・#763、docs/domain/settlement.md「月次仕入れ上限チェック」）。判定は all-or-nothing で、
   * period 内の他の確定額＋請求額が上限を超えれば draft.limitExceeded を、超えなければ draft.withinLimit を
   * 保存し、保存した請求の状態を返す。orders.status が変われば adminUserId を主体として履歴に残す。
   * Stripe Invoice は作らない（invoice_sent のときだけ呼び出し側が発行する）。
   * period には、対象の注文の createdAt が入る月次の期間を渡す（確定額は注文日で数えるため。
   * 請求作成の日の期間を渡すと、先月の注文の明細を今月の枠でも数えてしまう）。
   * 組み立てた後に注文が変わっていれば（同じ明細の請求作成の同時実行を含む）、何も保存せずに
   * OrderConcurrentlyModifiedError を投げる（楽観ロック。#721）
   */
  createInvoiceSettlementWithLimitCheck(input: {
    draft: InvoiceSettlementDraft;
    period: MonthlyPeriod;
    // 無制限なら上限の判定をしない
    monthlyLimit: MonthlyLimit;
    adminUserId: string;
  }): Promise<InvoiceSettlementCreated>;

  /**
   * Orderを明細・決済単位ごと物理削除する。注文確定処理の途中失敗時の
   * 補償処理（compensating delete）専用。通常のキャンセル等では
   * 使用しない（statusの更新を使う）
   */
  delete(orderId: string): Promise<void>;

  /**
   * 会員の注文を状態に関わらずすべて取得する。退会できるかの判定
   * （どの注文が退会を止めるか）は User.withdraw() が行う（#587）
   */
  findByUserId(userId: string): Promise<Order[]>;

  /** 管理画面用: アクティブな注文一覧をユーザー情報込みで取得 */
  findActiveOrdersWithUser(): Promise<OrderWithUser[]>;

  /** 管理画面用: 注文詳細をユーザー情報・アイテム・決済単位込みで取得 */
  findByIdWithUser(orderId: string): Promise<OrderWithUser | null>;
}
