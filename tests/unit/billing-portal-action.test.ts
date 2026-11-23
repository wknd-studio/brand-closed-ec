import { describe, it, expect, vi, beforeEach } from "vitest";

// /settings の「お支払い方法を変更する」の Server Action（#216）

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/composition/billing-portal", () => ({
  startBillingPortalSession: vi.fn(),
}));

vi.mock("@/composition/member", () => ({ withdraw: vi.fn() }));
vi.mock("@/composition/address", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { startBillingPortalSession } from "@/composition/billing-portal";
import { openBillingPortalAction } from "@/app/(member)/settings/actions";

const PORTAL_URL = "https://billing.stripe.com/p/session/bps_1";

describe("openBillingPortalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: "clerk-self" } as never);
  });

  it("ログイン中の本人の Clerk userId で Session を作り、Portal にリダイレクトする", async () => {
    vi.mocked(startBillingPortalSession).mockResolvedValue({ url: PORTAL_URL });

    await expect(openBillingPortalAction()).rejects.toThrow(
      `NEXT_REDIRECT:${PORTAL_URL}`
    );

    expect(startBillingPortalSession).toHaveBeenCalledWith({
      clerkUserId: "clerk-self",
    });
    expect(redirect).toHaveBeenCalledWith(PORTAL_URL);
  });

  it("未ログイン: Session を作らずにエラーを返す", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: null } as never);

    const result = await openBillingPortalAction();

    expect(startBillingPortalSession).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("Stripe Customer が無い会員: リダイレクトせずにエラーを返す", async () => {
    vi.mocked(startBillingPortalSession).mockResolvedValue({ url: null });

    const result = await openBillingPortalAction();

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: "お支払い方法は入会のお手続き後に変更できます",
    });
  });

  it("Stripe の失敗: Sentry に送り、エラーを返す", async () => {
    const error = new Error("Stripe API エラー");
    vi.mocked(startBillingPortalSession).mockRejectedValue(error);

    const result = await openBillingPortalAction();

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { useCase: "startBillingPortalSession" },
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: "お支払い方法の変更画面を開けませんでした",
    });
  });
});
