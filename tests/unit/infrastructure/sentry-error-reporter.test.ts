import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";

// GitHub issue #447
describe("SentryErrorReporter.captureException", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("エラーとtags・extraをそのままSentry.captureExceptionに渡す", () => {
    const error = new Error("失敗");

    new SentryErrorReporter().captureException(error, {
      tags: { useCase: "withdraw" },
      extra: { clerkUserId: "clerk-1" },
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { useCase: "withdraw" },
      extra: { clerkUserId: "clerk-1" },
    });
  });

  it("contextを省略してもSentry.captureExceptionに送る", () => {
    const error = new Error("失敗");

    new SentryErrorReporter().captureException(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error, undefined);
  });
});
