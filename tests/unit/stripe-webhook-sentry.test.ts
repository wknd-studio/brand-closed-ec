import { describe, it, expect, vi, beforeEach } from "vitest";

const constructEventMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infrastructure/supabase/supabase-order-repository", () => ({
  SupabaseOrderRepository: vi.fn(),
}));
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));
vi.mock("@/infrastructure/resend/resend-notification-service", () => ({
  ResendNotificationService: vi.fn(),
}));
vi.mock("@/infrastructure/clerk/clerk-account-gateway", () => ({
  ClerkAccountGateway: vi.fn(),
}));
vi.mock("@/use-cases/mark-checkout-order-as-paid", () => ({
  markCheckoutOrderAsPaid: vi.fn(),
}));
vi.mock("@/use-cases/mark-invoice-order-as-paid", () => ({
  markInvoiceOrderAsPaid: vi.fn(),
}));
vi.mock("@/use-cases/complete-subscription-onboarding", () => ({
  completeSubscriptionOnboarding: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { markCheckoutOrderAsPaid } from "@/use-cases/mark-checkout-order-as-paid";
import { markInvoiceOrderAsPaid } from "@/use-cases/mark-invoice-order-as-paid";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import { POST } from "@/app/api/webhooks/stripe/route";

function makeRequest(body = "{}") {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body,
  });
}

describe("POST /api/webhooks/stripe - Sentry例外送信", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("checkout.session.completed(mode: payment)の処理失敗時にSentry.captureExceptionを呼ぶ", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_1", object: "checkout.session", mode: "payment" },
      },
    });
    const error = new Error("注文が見つかりません");
    vi.mocked(markCheckoutOrderAsPaid).mockRejectedValue(error);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({
          webhook: "stripe",
          eventType: "checkout.session.completed",
        }),
      })
    );
  });

  it("checkout.session.completed(mode: subscription)の処理失敗時にSentry.captureExceptionを呼ぶ", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          object: "checkout.session",
          mode: "subscription",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { clerk_user_id: "clerk_1", plan: "starter" },
        },
      },
    });
    const error = new Error("ユーザーが見つかりません");
    vi.mocked(completeSubscriptionOnboarding).mockRejectedValue(error);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({
          webhook: "stripe",
          eventType: "checkout.session.completed",
        }),
      })
    );
  });

  it("invoice.paidの処理失敗時にSentry.captureExceptionを呼ぶ", async () => {
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: { id: "in_1" } },
    });
    const error = new Error("注文が見つかりません");
    vi.mocked(markInvoiceOrderAsPaid).mockRejectedValue(error);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({
          webhook: "stripe",
          eventType: "invoice.paid",
        }),
      })
    );
  });

  it("署名検証失敗（400）ではSentry.captureExceptionを呼ばない", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("処理が成功した場合はSentry.captureExceptionを呼ばない", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_3", object: "checkout.session", mode: "payment" },
      },
    });
    vi.mocked(markCheckoutOrderAsPaid).mockResolvedValue(undefined);

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("checkout.session.completed(mode: payment)の処理をSentry.startSpanでラップする", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_4", object: "checkout.session", mode: "payment" },
      },
    });
    vi.mocked(markCheckoutOrderAsPaid).mockResolvedValue(undefined);

    await POST(makeRequest());

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      { name: "markCheckoutOrderAsPaid", op: "webhook.process" },
      expect.any(Function)
    );
  });

  it("checkout.session.completed(mode: subscription)の処理をSentry.startSpanでラップする", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_5",
          object: "checkout.session",
          mode: "subscription",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { clerk_user_id: "clerk_1", plan: "starter" },
        },
      },
    });
    vi.mocked(completeSubscriptionOnboarding).mockResolvedValue(undefined);

    await POST(makeRequest());

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      { name: "completeSubscriptionOnboarding", op: "webhook.process" },
      expect.any(Function)
    );
  });

  it("invoice.paidの処理をSentry.startSpanでラップする", async () => {
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: { id: "in_2" } },
    });
    vi.mocked(markInvoiceOrderAsPaid).mockResolvedValue(undefined);

    await POST(makeRequest());

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      { name: "markInvoiceOrderAsPaid", op: "webhook.process" },
      expect.any(Function)
    );
  });
});
