export type StripeWebhookEventClaimInput = {
  eventId: string;
  type: string;
  payload: unknown;
};

export interface StripeWebhookEventRepository {
  /**
   * イベントを処理中として確保する（DBレベルの冪等性チェック）。
   * 新規イベント、または前回`failed`で終わったイベントの再送であればtrue、
   * 処理中/処理済みの再送であればfalseを返す。
   */
  claim(input: StripeWebhookEventClaimInput): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}
