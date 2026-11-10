import { describe, it, expect, vi } from "vitest";
import { processStripeWebhookEventOnce } from "@/use-cases/process-stripe-webhook-event-once";
import type { StripeWebhookEventRepository } from "@/repositories/stripe-webhook-event-repository";
import { makeErrorReporter } from "./helpers";

function makeWebhookEventRepo(
  claim: "claimed" | "processing" | "processed" = "claimed"
): StripeWebhookEventRepository {
  return {
    claim: vi.fn().mockResolvedValue(claim),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

const EVENT = {
  eventId: "evt_1",
  type: "invoice.paid",
  payload: { id: "evt_1" },
};
const FAILURE_REPORT = {
  tags: { webhook: "stripe", eventType: "invoice.paid" },
  extra: { stripeInvoiceId: "in_1", eventId: "evt_1" },
};

// GitHub issue #554
describe("processStripeWebhookEventOnce", () => {
  it("claimできたら処理を実行し、markProcessedする", async () => {
    const webhookEventRepo = makeWebhookEventRepo();
    const errorReporter = makeErrorReporter();
    const process = vi.fn().mockResolvedValue(undefined);

    const result = await processStripeWebhookEventOnce(
      { event: EVENT, process, failureReport: FAILURE_REPORT },
      { webhookEventRepo, errorReporter }
    );

    expect(result).toEqual({ status: "processed" });
    expect(webhookEventRepo.claim).toHaveBeenCalledWith(EVENT);
    expect(process).toHaveBeenCalledTimes(1);
    expect(webhookEventRepo.markProcessed).toHaveBeenCalledWith("evt_1");
    expect(webhookEventRepo.markFailed).not.toHaveBeenCalled();
    expect(errorReporter.captureException).not.toHaveBeenCalled();
  });

  it.each(["processing", "processed"] as const)(
    "claimの結果が%sなら処理を実行せずにスキップする",
    async (claim) => {
      const webhookEventRepo = makeWebhookEventRepo(claim);
      const errorReporter = makeErrorReporter();
      const process = vi.fn();

      const result = await processStripeWebhookEventOnce(
        { event: EVENT, process, failureReport: FAILURE_REPORT },
        { webhookEventRepo, errorReporter }
      );

      expect(result).toEqual({ status: "skipped", claim });
      expect(process).not.toHaveBeenCalled();
      expect(webhookEventRepo.markProcessed).not.toHaveBeenCalled();
      expect(webhookEventRepo.markFailed).not.toHaveBeenCalled();
      expect(errorReporter.captureException).not.toHaveBeenCalled();
    }
  );

  it("処理が失敗したら、ErrorReporterに通知してからmarkFailedし、failedを返す", async () => {
    const webhookEventRepo = makeWebhookEventRepo();
    const errorReporter = makeErrorReporter();
    const error = new Error("注文が見つかりません");
    const process = vi.fn().mockRejectedValue(error);

    const result = await processStripeWebhookEventOnce(
      { event: EVENT, process, failureReport: FAILURE_REPORT },
      { webhookEventRepo, errorReporter }
    );

    expect(result).toEqual({ status: "failed", error });
    expect(errorReporter.captureException).toHaveBeenCalledWith(
      error,
      FAILURE_REPORT
    );
    expect(webhookEventRepo.markFailed).toHaveBeenCalledWith(
      "evt_1",
      "注文が見つかりません"
    );
    expect(webhookEventRepo.markProcessed).not.toHaveBeenCalled();
    expect(
      vi.mocked(errorReporter.captureException).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(webhookEventRepo.markFailed).mock.invocationCallOrder[0]
    );
  });

  it("Error以外の値で失敗したら、文字列にしてmarkFailedに記録する", async () => {
    const webhookEventRepo = makeWebhookEventRepo();
    const process = vi.fn().mockRejectedValue("timeout");

    const result = await processStripeWebhookEventOnce(
      { event: EVENT, process, failureReport: FAILURE_REPORT },
      { webhookEventRepo, errorReporter: makeErrorReporter() }
    );

    expect(result).toEqual({ status: "failed", error: "timeout" });
    expect(webhookEventRepo.markFailed).toHaveBeenCalledWith(
      "evt_1",
      "timeout"
    );
  });

  it("markProcessedが失敗したら、処理の失敗として扱う", async () => {
    const webhookEventRepo = makeWebhookEventRepo();
    const errorReporter = makeErrorReporter();
    const error = new Error("DB接続エラー");
    vi.mocked(webhookEventRepo.markProcessed).mockRejectedValue(error);

    const result = await processStripeWebhookEventOnce(
      {
        event: EVENT,
        process: vi.fn().mockResolvedValue(undefined),
        failureReport: FAILURE_REPORT,
      },
      { webhookEventRepo, errorReporter }
    );

    expect(result).toEqual({ status: "failed", error });
    expect(errorReporter.captureException).toHaveBeenCalledWith(
      error,
      FAILURE_REPORT
    );
    expect(webhookEventRepo.markFailed).toHaveBeenCalledWith(
      "evt_1",
      "DB接続エラー"
    );
  });

  it("markFailed自体が失敗したら、元の例外を通知したうえでmarkFailedの例外を投げる（issue #409）", async () => {
    const webhookEventRepo = makeWebhookEventRepo();
    const errorReporter = makeErrorReporter();
    const error = new Error("注文が見つかりません");
    vi.mocked(webhookEventRepo.markFailed).mockRejectedValue(
      new Error("DB接続エラー")
    );

    await expect(
      processStripeWebhookEventOnce(
        {
          event: EVENT,
          process: vi.fn().mockRejectedValue(error),
          failureReport: FAILURE_REPORT,
        },
        { webhookEventRepo, errorReporter }
      )
    ).rejects.toThrow("DB接続エラー");

    expect(errorReporter.captureException).toHaveBeenCalledWith(
      error,
      FAILURE_REPORT
    );
  });
});
