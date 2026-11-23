import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createPortalSessionMock = vi.fn();

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    billingPortal: { sessions: { create: createPortalSessionMock } },
  }),
}));

import { StripeBillingPortalGateway } from "@/infrastructure/stripe/stripe-billing-portal-gateway";

describe("StripeBillingPortalGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("STRIPE_BILLING_PORTAL_CONFIGURATION_ID", "bpc_card_only");
    createPortalSessionMock.mockResolvedValue({
      url: "https://billing.stripe.com/p/session/bps_1",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Customer ID・/settings への return_url・カード変更だけの設定を渡し、Portal の URL を返す", async () => {
    const url =
      await new StripeBillingPortalGateway().createBillingPortalSession(
        "cus_self"
      );

    expect(createPortalSessionMock).toHaveBeenCalledWith({
      customer: "cus_self",
      return_url: "https://app.example.com/settings",
      configuration: "bpc_card_only",
      locale: "ja",
    });
    expect(url).toBe("https://billing.stripe.com/p/session/bps_1");
  });

  it("設定の ID が無いときは Session を作らずに失敗する（解約できる既定の設定を使わない）", async () => {
    vi.stubEnv("STRIPE_BILLING_PORTAL_CONFIGURATION_ID", "");

    await expect(
      new StripeBillingPortalGateway().createBillingPortalSession("cus_self")
    ).rejects.toThrow("STRIPE_BILLING_PORTAL_CONFIGURATION_ID");
    expect(createPortalSessionMock).not.toHaveBeenCalled();
  });
});
