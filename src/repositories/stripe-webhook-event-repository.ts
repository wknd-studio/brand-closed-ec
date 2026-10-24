export type StripeWebhookEventClaimInput = {
  eventId: string;
  type: string;
  payload: unknown;
};

/**
 * claimの結果。
 * - `claimed`: 確保できた（新規・前回`failed`・processingのまま10分以上たったイベント）
 * - `processing`: 別のリクエストが処理中。2xxを返すとStripeが再送をやめ、元の処理が
 *   落ちたときに回復できないため、呼び出し側は2xx以外を返して再送させる（issue #424）
 * - `processed`: 処理済み。2xxを返してスキップする
 */
export type StripeWebhookEventClaimResult =
  | "claimed"
  | "processing"
  | "processed";

export interface StripeWebhookEventRepository {
  /**
   * イベントを処理中として確保する（DBレベルの冪等性チェック）。
   */
  claim(
    input: StripeWebhookEventClaimInput
  ): Promise<StripeWebhookEventClaimResult>;
  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}
