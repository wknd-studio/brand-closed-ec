export type ErrorReportContext = {
  /** 検索・フィルタ用（例: useCase・step） */
  tags?: Record<string, string>;
  /** 調査に必要な追加情報（例: orderId） */
  extra?: Record<string, unknown>;
};

/**
 * 想定外の失敗を運営者に通知する。例外を握りつぶして処理を続ける箇所で使う
 * （docs/ai-prompts/sentry.md）
 */
export interface ErrorReporter {
  captureException(error: unknown, context?: ErrorReportContext): void;
}
