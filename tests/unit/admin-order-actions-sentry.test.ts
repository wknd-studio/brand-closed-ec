import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/use-cases/issue-invoice", () => ({
  issueInvoice: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infrastructure/supabase/supabase-order-repository", () => ({
  SupabaseOrderRepository: vi.fn().mockImplementation(function () {
    return {
      findById: vi.fn().mockResolvedValue({ id: "order-1", items: [] }),
    };
  }),
}));
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));
vi.mock("@/infrastructure/stripe/stripe-payment-gateway", () => ({
  StripePaymentGateway: vi.fn(),
}));
vi.mock("@/infrastructure/resend/resend-notification-service", () => ({
  ResendNotificationService: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { issueInvoice as issueInvoiceUseCase } from "@/use-cases/issue-invoice";
import { issueInvoice } from "@/app/admin/orders/[id]/actions";

describe("issueInvoice Server Action - Sentryカスタムスパン", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: "clerk-admin-1",
      sessionClaims: { metadata: { role: "admin" } },
    } as never);
  });

  it("Sentry.startSpanでラップして実行する", async () => {
    vi.mocked(issueInvoiceUseCase).mockResolvedValue({ success: true });

    await issueInvoice("order-1", new FormData());

    expect(Sentry.startSpan).toHaveBeenCalledWith(
      { name: "issueInvoice", op: "server-action.process" },
      expect.any(Function)
    );
  });
});
