import { describe, it, expect, vi, beforeEach } from "vitest";

// 入会のCheckout Webhookの運営者への通知が、routeからSentryを直接呼ばず
// ErrorReporter（composition が注入する実装）経由で届くことを確かめる（issue #572）
const { constructEventMock, reporterCaptureMessageMock } = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  reporterCaptureMessageMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

vi.mock("@/infrastructure/sentry/sentry-error-reporter", () => ({
  SentryErrorReporter: vi.fn().mockImplementation(function () {
    return {
      captureException: vi.fn(),
      captureMessage: reporterCaptureMessageMock,
    };
  }),
}));

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        status: "active",
        start_date: Math.floor(new Date(2026, 0, 1).getTime() / 1000),
        items: {
          data: [
            {
              current_period_start: Math.floor(
                new Date(2026, 0, 1).getTime() / 1000
              ),
              current_period_end: Math.floor(
                new Date(2026, 1, 1).getTime() / 1000
              ),
            },
          ],
        },
      }),
    },
  }),
}));

vi.mock("@/infrastructure/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));
vi.mock(
  "@/infrastructure/supabase/supabase-stripe-webhook-event-repository",
  () => ({
    SupabaseStripeWebhookEventRepository: vi
      .fn()
      .mockImplementation(function () {
        return {
          claim: vi.fn().mockResolvedValue("claimed"),
          markProcessed: vi.fn().mockResolvedValue(undefined),
          markFailed: vi.fn().mockResolvedValue(undefined),
        };
      }),
  })
);
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));
vi.mock(
  "@/infrastructure/supabase/supabase-subscription-onboarding-repository",
  () => ({ SupabaseSubscriptionOnboardingRepository: vi.fn() })
);
vi.mock("@/infrastructure/clerk/clerk-account-gateway", () => ({
  ClerkAccountGateway: vi.fn(),
}));
vi.mock("@/use-cases/complete-subscription-onboarding", () => ({
  completeSubscriptionOnboarding: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import { POST } from "@/app/api/webhooks/stripe/route";

const SESSION = {
  id: "cs_1",
  object: "checkout.session",
  mode: "subscription",
  payment_status: "paid",
  customer: "cus_1",
  subscription: "sub_1",
  metadata: { clerk_user_id: "clerk_1", plan: "starter" },
};

async function post(session: Record<string, unknown>) {
  constructEventMock.mockReturnValue({
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { ...SESSION, ...session } },
  });
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "test-sig" },
      body: "{}",
    })
  );
}

describe("POST /api/webhooks/stripe - 入会のCheckoutの運営者への通知", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("metadataが不正なセッションは、ErrorReporterでwarningを通知して200を返す", async () => {
    const res = await post({ metadata: { plan: "enterprise" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(reporterCaptureMessageMock).toHaveBeenCalledWith(
      "入会のCheckoutセッションのmetadataが無い、または不正なため入会を確定しませんでした",
      expect.objectContaining({ level: "warning" })
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(completeSubscriptionOnboarding).not.toHaveBeenCalled();
  });

  it("支払い済みでないセッションは、ErrorReporterでwarningを通知して200を返す", async () => {
    const res = await post({ payment_status: "unpaid" });

    expect(res.status).toBe(200);
    expect(reporterCaptureMessageMock).toHaveBeenCalledWith(
      "入会のCheckoutセッションが支払い済みでないため入会を確定しませんでした",
      expect.objectContaining({ level: "warning" })
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(completeSubscriptionOnboarding).not.toHaveBeenCalled();
  });

  it("入会を確定できなかった（member_not_found）ら、ErrorReporterでerrorを通知して200を返す", async () => {
    vi.mocked(completeSubscriptionOnboarding).mockResolvedValue(
      "member_not_found"
    );

    const res = await post({});

    expect(res.status).toBe(200);
    expect(reporterCaptureMessageMock).toHaveBeenCalledWith(
      "退会済み、または未登録の会員の入会が届きました。手動で返金・解約してください",
      expect.objectContaining({ level: "error" })
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
