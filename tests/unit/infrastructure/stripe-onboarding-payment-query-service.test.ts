import { describe, it, expect, vi, beforeEach } from "vitest";

const retrieveCheckoutSessionMock = vi.fn();
const listSubscriptionsMock = vi.fn();
vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: retrieveCheckoutSessionMock } },
    subscriptions: { list: listSubscriptionsMock },
  }),
}));

import { StripeOnboardingPaymentQueryService } from "@/infrastructure/stripe/stripe-onboarding-payment-query-service";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import { startOnboardingCheckout } from "@/use-cases/start-onboarding-checkout";
import { makeUser, makeUserRepo } from "../use-cases/helpers";

const SESSION_ID = "cs_test_a1B2c3";

const findStripeCustomerId =
  vi.fn<(clerkUserId: string) => Promise<string | null>>();
// 有効なサブスクリプションの判定は、決済画面と同じ gateway（SDK だけをモック）で行う
const queryService = new StripeOnboardingPaymentQueryService(
  { findStripeCustomerId },
  new StripeOnboardingCheckoutGateway()
);

function findPaymentCompleted(sessionId: string | null) {
  return queryService.findPaymentCompleted({
    clerkUserId: "clerk-1",
    sessionId,
  });
}

function stripeError(type: string, statusCode?: number) {
  return Object.assign(new Error(type), { type, statusCode });
}

/**
 * 決済完了画面の決済の確認（GitHub issue #425）。URLのsession_idでCheckout Sessionを
 * 取得し、本人のセッションで決済が完了しているかを確かめる。決済していない会員が
 * 履歴・ブックマーク等から開いたときに、事実と違う案内を出さないため
 */
describe("StripeOnboardingPaymentQueryService.findPaymentCompleted - session_idの検証", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findStripeCustomerId.mockResolvedValue(null);
    listSubscriptionsMock.mockResolvedValue({ data: [] });
  });

  it("本人のセッションで決済が完了していれば true で、サブスクリプションを確認しない", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: { clerk_user_id: "clerk-1" },
    });

    expect(await findPaymentCompleted(SESSION_ID)).toBe(true);
    expect(retrieveCheckoutSessionMock).toHaveBeenCalledWith(SESSION_ID);
    expect(findStripeCustomerId).not.toHaveBeenCalled();
    expect(listSubscriptionsMock).not.toHaveBeenCalled();
  });

  it("session_idが無ければStripeに問い合わせず false", async () => {
    expect(await findPaymentCompleted(null)).toBe(false);
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("Checkout SessionのIDの形式でなければStripeに問い合わせず false", async () => {
    expect(await findPaymentCompleted("../customers/cus_1")).toBe(false);
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("存在しないセッション（404）なら false（例外にしない）", async () => {
    retrieveCheckoutSessionMock.mockRejectedValue(
      stripeError("StripeInvalidRequestError", 404)
    );

    expect(await findPaymentCompleted(SESSION_ID)).toBe(false);
  });

  it("他の会員のセッションなら false", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: { clerk_user_id: "clerk-other" },
    });

    expect(await findPaymentCompleted(SESSION_ID)).toBe(false);
  });

  it("metadataに会員が無いセッションなら false", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: {},
    });

    expect(await findPaymentCompleted(SESSION_ID)).toBe(false);
  });

  it.each(["open", "expired"])(
    "決済が完了していない（status=%s）なら false",
    async (status) => {
      retrieveCheckoutSessionMock.mockResolvedValue({
        status,
        metadata: { clerk_user_id: "clerk-1" },
      });

      expect(await findPaymentCompleted(SESSION_ID)).toBe(false);
    }
  );

  it.each([
    [
      "404以外の不正なリクエスト",
      stripeError("StripeInvalidRequestError", 400),
    ],
    ["5xx", stripeError("StripeAPIError", 500)],
    ["ネットワーク", stripeError("StripeConnectionError")],
    ["レート制限", stripeError("StripeRateLimitError", 429)],
    [
      "認証エラー（APIキーの設定不備）",
      stripeError("StripeAuthenticationError", 401),
    ],
  ])(
    "Stripe APIの失敗（%s）は、確かめられないため例外にし、サブスクリプションを確認しない",
    async (_label, error) => {
      retrieveCheckoutSessionMock.mockRejectedValue(error);

      await expect(findPaymentCompleted(SESSION_ID)).rejects.toBe(error);
      expect(listSubscriptionsMock).not.toHaveBeenCalled();
    }
  );
});

/**
 * 有効なサブスクリプションがある会員（GitHub issue #461）。決済画面は、Customerに
 * 有効なサブスクリプションがあるとsession_idを付けずに決済完了画面へ送るため、
 * session_idが無くても決済済みとして扱う
 */
describe("StripeOnboardingPaymentQueryService.findPaymentCompleted - 有効なサブスクリプションの確認", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findStripeCustomerId.mockResolvedValue("cus_1");
    listSubscriptionsMock.mockResolvedValue({ data: [] });
  });

  it("session_idが無くても、本人のCustomerに有効なサブスクリプションがあれば true", async () => {
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });

    expect(await findPaymentCompleted(null)).toBe(true);
    expect(findStripeCustomerId).toHaveBeenCalledWith("clerk-1");
    expect(listSubscriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1" })
    );
  });

  it("session_idが決済完了でなくても、有効なサブスクリプションがあれば true", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "expired",
      metadata: { clerk_user_id: "clerk-1" },
    });
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });

    expect(await findPaymentCompleted(SESSION_ID)).toBe(true);
  });

  it.each(["canceled", "incomplete_expired"])(
    "終了したサブスクリプション（status=%s）しか無ければ false",
    async (status) => {
      listSubscriptionsMock.mockResolvedValue({ data: [{ status }] });

      expect(await findPaymentCompleted(null)).toBe(false);
    }
  );

  it("サブスクリプションが無ければ false", async () => {
    expect(await findPaymentCompleted(null)).toBe(false);
  });

  it("Stripe Customerが未作成（会員の行が無い場合を含む）なら、Stripeに問い合わせず false", async () => {
    findStripeCustomerId.mockResolvedValue(null);

    expect(await findPaymentCompleted(null)).toBe(false);
    expect(listSubscriptionsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["5xx", stripeError("StripeAPIError", 500)],
    ["ネットワーク", stripeError("StripeConnectionError")],
  ])(
    "サブスクリプションの確認でStripe APIが失敗（%s）したら例外にする",
    async (_label, error) => {
      listSubscriptionsMock.mockRejectedValue(error);

      await expect(findPaymentCompleted(null)).rejects.toBe(error);
    }
  );

  it("会員の取得に失敗したら例外にする", async () => {
    const error = new Error("db down");
    findStripeCustomerId.mockRejectedValue(error);

    await expect(findPaymentCompleted(null)).rejects.toBe(error);
  });

  it("決済画面で有効なサブスクリプションがあると判定された会員を、決済完了と判定する", async () => {
    // 決済直後にタブを閉じ、Webhookが届く前に開き直した会員
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(
      makeUser({
        rank: "premium",
        onboardingCompleted: false,
        stripeCustomerId: "cus_1",
      })
    );

    const checkout = await startOnboardingCheckout(
      { clerkUserId: "clerk-1", email: undefined },
      { userRepo, checkoutGateway: new StripeOnboardingCheckoutGateway() }
    );
    if (!("redirectTo" in checkout)) throw new Error("Checkoutが作られた");

    const redirectUrl = new URL(checkout.redirectTo, "https://example.com");
    expect(redirectUrl.pathname).toBe("/onboarding/payment/success");
    expect(
      await findPaymentCompleted(redirectUrl.searchParams.get("session_id"))
    ).toBe(true);
  });
});
