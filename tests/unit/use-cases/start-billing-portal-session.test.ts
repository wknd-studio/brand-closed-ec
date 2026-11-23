import { describe, it, expect, vi } from "vitest";
import { startBillingPortalSession } from "@/use-cases/start-billing-portal-session";
import type { BillingPortalGateway } from "@/repositories/billing-portal-gateway";
import { makeUserRepo, makeUser } from "./helpers";

const PORTAL_URL = "https://billing.stripe.com/p/session/bps_1";

function setup(user: ReturnType<typeof makeUser> | null) {
  const userRepo = makeUserRepo();
  vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(user);
  const billingPortalGateway: BillingPortalGateway = {
    createBillingPortalSession: vi.fn().mockResolvedValue(PORTAL_URL),
  };
  return { userRepo, billingPortalGateway };
}

describe("startBillingPortalSession", () => {
  it("ログイン中の会員の Stripe Customer で Billing Portal Session を作り、URL を返す", async () => {
    const deps = setup(makeUser({ stripeCustomerId: "cus_self" }));

    const result = await startBillingPortalSession(
      { clerkUserId: "clerk-1" },
      deps
    );

    expect(deps.userRepo.findByClerkUserId).toHaveBeenCalledWith("clerk-1");
    expect(
      deps.billingPortalGateway.createBillingPortalSession
    ).toHaveBeenCalledWith("cus_self");
    expect(result).toEqual({ url: PORTAL_URL });
  });

  it("Stripe Customer が無い会員（入会前）: Session を作らない", async () => {
    const deps = setup(makeUser({ stripeCustomerId: null }));

    const result = await startBillingPortalSession(
      { clerkUserId: "clerk-1" },
      deps
    );

    expect(
      deps.billingPortalGateway.createBillingPortalSession
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ url: null });
  });

  it("会員が見つからない（退会済み等）: Session を作らない", async () => {
    const deps = setup(null);

    const result = await startBillingPortalSession(
      { clerkUserId: "clerk-1" },
      deps
    );

    expect(
      deps.billingPortalGateway.createBillingPortalSession
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ url: null });
  });
});
