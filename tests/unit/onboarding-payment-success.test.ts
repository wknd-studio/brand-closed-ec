import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

const retrieveCheckoutSessionMock = vi.fn();
const listSubscriptionsMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: retrieveCheckoutSessionMock } },
    subscriptions: { list: listSubscriptionsMock },
  }),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

const userRepo = makeUserRepo();
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(function () {
    return userRepo;
  }),
}));

vi.mock("@/app/onboarding/payment/success/actions", () => ({
  isOnboardingCompleted: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { isOnboardingCompleted } from "@/app/onboarding/payment/success/actions";
import PaymentSuccessPage from "@/app/onboarding/payment/success/page";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import { startOnboardingCheckout } from "@/use-cases/start-onboarding-checkout";
import { makeUser, makeUserRepo } from "./use-cases/helpers";

const SESSION_ID = "cs_test_a1B2c3";

function renderPage(searchParams: Record<string, string | string[]>) {
  return PaymentSuccessPage({ searchParams: Promise.resolve(searchParams) });
}

function setUser(stripeCustomerId: string | null) {
  vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(
    makeUser({ rank: "premium", onboardingCompleted: false }).with({
      stripeCustomerId,
    })
  );
}

function stripeError(type: string, statusCode?: number) {
  return Object.assign(new Error(type), { type, statusCode });
}

/**
 * 決済完了画面（GitHub issue #425）。URLのsession_idでCheckout Sessionを取得し、
 * 本人のセッションで決済が完了している場合だけ「処理中」を表示する。決済していない
 * 会員が履歴・ブックマーク等から開いたときに、事実と違う案内を出さないため
 */
describe("PaymentSuccessPage - session_idの検証", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(isOnboardingCompleted).mockResolvedValue(false);
    setUser(null);
    listSubscriptionsMock.mockResolvedValue({ data: [] });
  });

  it("本人のセッションで決済が完了していれば、ショップ・プラン選択への導線を出さずに処理中を表示する", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: { clerk_user_id: "clerk-1" },
    });

    const html = renderToStaticMarkup(
      (await renderPage({ session_id: SESSION_ID })) as ReactElement
    );

    expect(retrieveCheckoutSessionMock).toHaveBeenCalledWith(SESSION_ID);
    expect(html).toContain("処理中");
    // 確定前にショップ・プラン選択へ進むと、再決済による二重課金を招く（#407）
    expect(html).not.toContain("<a");
  });

  it("入会済みならsession_idに関わらず/shopへ進む", async () => {
    vi.mocked(isOnboardingCompleted).mockResolvedValue(true);

    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/shop");
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("session_idが無ければStripeに問い合わせず種別選択へ戻す", async () => {
    await expect(renderPage({})).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("session_idが複数指定されていれば種別選択へ戻す", async () => {
    await expect(
      renderPage({ session_id: [SESSION_ID, SESSION_ID] })
    ).rejects.toThrow("NEXT_REDIRECT:/onboarding/account-type");
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("Checkout SessionのIDの形式でなければStripeに問い合わせず種別選択へ戻す", async () => {
    await expect(
      renderPage({ session_id: "../customers/cus_1" })
    ).rejects.toThrow("NEXT_REDIRECT:/onboarding/account-type");
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("存在しないセッション（404）なら、Sentryに送らず種別選択へ戻す", async () => {
    retrieveCheckoutSessionMock.mockRejectedValue(
      stripeError("StripeInvalidRequestError", 404)
    );

    await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("他人のセッションなら種別選択へ戻す", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: { clerk_user_id: "clerk-other" },
    });

    await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
  });

  it("metadataに会員が無いセッションなら種別選択へ戻す", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: {},
    });

    await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
  });

  it.each(["open", "expired"])(
    "決済が完了していない（status=%s）なら種別選択へ戻す",
    async (status) => {
      retrieveCheckoutSessionMock.mockResolvedValue({
        status,
        metadata: { clerk_user_id: "clerk-1" },
      });

      await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
        "NEXT_REDIRECT:/onboarding/account-type"
      );
    }
  );

  it("未ログインなら種別選択へ戻す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["5xx", stripeError("StripeAPIError", 500)],
    ["ネットワーク", stripeError("StripeConnectionError")],
    ["レート制限", stripeError("StripeRateLimitError", 429)],
    [
      "認証エラー（APIキーの設定不備）",
      stripeError("StripeAuthenticationError", 401),
    ],
  ])(
    "Stripe APIの失敗（%s）はSentryに送り、確定待ちを表示せず再読み込みを促す",
    async (_label, error) => {
      retrieveCheckoutSessionMock.mockRejectedValue(error);

      const html = renderToStaticMarkup(
        (await renderPage({ session_id: SESSION_ID })) as ReactElement
      );

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: expect.objectContaining({
            page: "onboarding-payment-success",
          }),
        })
      );
      expect(html).toContain("再読み込み");
      expect(html).not.toContain("処理中");
    }
  );
});

/**
 * 有効なサブスクリプションがある会員（GitHub issue #461）。決済画面は、Customerに
 * 有効なサブスクリプションがあるとsession_idを付けずにこの画面へ送るため、
 * session_idが無くてもWebhookによる確定を待つ表示にする
 */
describe("PaymentSuccessPage - 有効なサブスクリプションの確認", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(isOnboardingCompleted).mockResolvedValue(false);
    setUser("cus_1");
    listSubscriptionsMock.mockResolvedValue({ data: [] });
  });

  it("session_idが無くても、本人のCustomerに有効なサブスクリプションがあれば処理中を表示する", async () => {
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });

    const html = renderToStaticMarkup((await renderPage({})) as ReactElement);

    expect(listSubscriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_1" })
    );
    expect(html).toContain("処理中");
    expect(html).not.toContain("<a");
  });

  it("session_idが決済完了でなくても、有効なサブスクリプションがあれば処理中を表示する", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "expired",
      metadata: { clerk_user_id: "clerk-1" },
    });
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });

    const html = renderToStaticMarkup(
      (await renderPage({ session_id: SESSION_ID })) as ReactElement
    );

    expect(html).toContain("処理中");
  });

  it.each(["canceled", "incomplete_expired"])(
    "終了したサブスクリプション（status=%s）しか無ければ種別選択へ戻す",
    async (status) => {
      listSubscriptionsMock.mockResolvedValue({ data: [{ status }] });

      await expect(renderPage({})).rejects.toThrow(
        "NEXT_REDIRECT:/onboarding/account-type"
      );
    }
  );

  it("サブスクリプションが無ければ種別選択へ戻す", async () => {
    await expect(renderPage({})).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
  });

  it("Stripe Customerが未作成なら、Stripeに問い合わせず種別選択へ戻す", async () => {
    setUser(null);

    await expect(renderPage({})).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
    expect(listSubscriptionsMock).not.toHaveBeenCalled();
  });

  it("会員の行が無ければ、Stripeに問い合わせず種別選択へ戻す", async () => {
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    await expect(renderPage({})).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
    expect(listSubscriptionsMock).not.toHaveBeenCalled();
  });

  it("本人のセッションで決済が完了していれば、サブスクリプションを確認しない", async () => {
    retrieveCheckoutSessionMock.mockResolvedValue({
      status: "complete",
      metadata: { clerk_user_id: "clerk-1" },
    });

    await renderPage({ session_id: SESSION_ID });

    expect(listSubscriptionsMock).not.toHaveBeenCalled();
  });

  it.each([
    ["5xx", stripeError("StripeAPIError", 500)],
    ["ネットワーク", stripeError("StripeConnectionError")],
  ])(
    "サブスクリプションの確認でStripe APIが失敗（%s）したら、Sentryに送り、確定待ちも種別選択も出さず再読み込みを促す",
    async (_label, error) => {
      listSubscriptionsMock.mockRejectedValue(error);

      const html = renderToStaticMarkup((await renderPage({})) as ReactElement);

      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: expect.objectContaining({
            page: "onboarding-payment-success",
          }),
        })
      );
      expect(html).toContain("再読み込み");
      expect(html).not.toContain("処理中");
    }
  );

  it("会員の取得に失敗したら、Sentryに送り再読み込みを促す", async () => {
    const error = new Error("db down");
    vi.mocked(userRepo.findByClerkUserId).mockRejectedValue(error);

    const html = renderToStaticMarkup((await renderPage({})) as ReactElement);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.anything()
    );
    expect(html).toContain("再読み込み");
  });

  it("決済画面で有効なサブスクリプションがあると判定された会員を、決済完了画面が種別選択へ戻さない", async () => {
    // 決済直後にタブを閉じ、Webhookが届く前に開き直した会員
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });

    const checkout = await startOnboardingCheckout(
      { clerkUserId: "clerk-1", email: undefined },
      { userRepo, checkoutGateway: new StripeOnboardingCheckoutGateway() }
    );
    if (!("redirectTo" in checkout)) throw new Error("Checkoutが作られた");

    const redirectUrl = new URL(checkout.redirectTo, "https://example.com");
    expect(redirectUrl.pathname).toBe("/onboarding/payment/success");

    const html = renderToStaticMarkup(
      (await renderPage(
        Object.fromEntries(redirectUrl.searchParams)
      )) as ReactElement
    );
    expect(html).toContain("処理中");
  });
});
