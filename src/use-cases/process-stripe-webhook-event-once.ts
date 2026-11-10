import type {
  StripeWebhookEventClaimInput,
  StripeWebhookEventClaimResult,
  StripeWebhookEventRepository,
} from "@/repositories/stripe-webhook-event-repository";
import type {
  ErrorReportContext,
  ErrorReporter,
} from "@/repositories/error-reporter";

export type ProcessStripeWebhookEventOnceInput = {
  event: StripeWebhookEventClaimInput;
  /** イベントの処理本体（決済完了・入会確定などの use-case の呼び出し） */
  process: () => Promise<void>;
  /** 処理が失敗したときに ErrorReporter に送る tags・extra */
  failureReport: ErrorReportContext;
};
export type ProcessStripeWebhookEventOnceDeps = {
  webhookEventRepo: StripeWebhookEventRepository;
  errorReporter: ErrorReporter;
};

export type ProcessStripeWebhookEventOnceResult =
  | {
      status: "skipped";
      claim: Exclude<StripeWebhookEventClaimResult, "claimed">;
    }
  | { status: "processed" }
  | { status: "failed"; error: unknown };

/**
 * stripe_webhook_eventsによるDBレベルの冪等性（issue #221）のもとで、Stripe Webhookの
 * イベントを1回だけ処理する。claim → 処理 → markProcessed。処理（markProcessedを含む）が
 * 失敗したら、運営者に通知してからmarkFailedし、次の再送でclaimし直せるようにする
 */
export async function processStripeWebhookEventOnce(
  input: ProcessStripeWebhookEventOnceInput,
  deps: ProcessStripeWebhookEventOnceDeps
): Promise<ProcessStripeWebhookEventOnceResult> {
  const { webhookEventRepo, errorReporter } = deps;

  const claim = await webhookEventRepo.claim(input.event);
  if (claim !== "claimed") return { status: "skipped", claim };

  try {
    await input.process();
    await webhookEventRepo.markProcessed(input.event.eventId);
    return { status: "processed" };
  } catch (error) {
    // markFailed自体が失敗しても元の例外が運営者に届くよう、先に通知する（issue #409）
    errorReporter.captureException(error, input.failureReport);
    const message = error instanceof Error ? error.message : String(error);
    await webhookEventRepo.markFailed(input.event.eventId, message);
    return { status: "failed", error };
  }
}
