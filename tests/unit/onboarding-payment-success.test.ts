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

const { findPaymentCompleted } = vi.hoisted(() => ({
  findPaymentCompleted: vi.fn(),
}));
vi.mock("@/composition/onboarding-payment-query", () => ({
  onboardingPaymentQueryService: async () => ({ findPaymentCompleted }),
}));

vi.mock("@/app/onboarding/payment/success/actions", () => ({
  isOnboardingCompleted: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { isOnboardingCompleted } from "@/app/onboarding/payment/success/actions";
import PaymentSuccessPage from "@/app/onboarding/payment/success/page";

const SESSION_ID = "cs_test_a1B2c3";

function renderPage(searchParams: Record<string, string | string[]>) {
  return PaymentSuccessPage({ searchParams: Promise.resolve(searchParams) });
}

/**
 * 決済完了画面（GitHub issue #425・#461）。決済の完了を Query Service で確かめ、
 * 完了している場合だけ「処理中」を表示する。判定そのもの（session_idの検証・
 * 有効なサブスクリプションの確認）は
 * tests/unit/infrastructure/stripe-onboarding-payment-query-service.test.ts で確認する
 */
describe("PaymentSuccessPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(isOnboardingCompleted).mockResolvedValue(false);
    findPaymentCompleted.mockResolvedValue(false);
  });

  it("決済が完了していれば、ショップ・プラン選択への導線を出さずに処理中を表示する", async () => {
    findPaymentCompleted.mockResolvedValue(true);

    const html = renderToStaticMarkup(
      (await renderPage({ session_id: SESSION_ID })) as ReactElement
    );

    expect(findPaymentCompleted).toHaveBeenCalledWith({
      clerkUserId: "clerk-1",
      sessionId: SESSION_ID,
    });
    expect(html).toContain("処理中");
    // 確定前にショップ・プラン選択へ進むと、再決済による二重課金を招く（#407）
    expect(html).not.toContain("<a");
  });

  it("入会済みならsession_idに関わらず/shopへ進む", async () => {
    vi.mocked(isOnboardingCompleted).mockResolvedValue(true);

    await expect(renderPage({})).rejects.toThrow("NEXT_REDIRECT:/shop");
    expect(findPaymentCompleted).not.toHaveBeenCalled();
  });

  it("決済が完了していなければ種別選択へ戻す", async () => {
    await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
  });

  it("session_idが無ければ、session_id無しで決済の完了を確かめる", async () => {
    findPaymentCompleted.mockResolvedValue(true);

    await renderPage({});

    expect(findPaymentCompleted).toHaveBeenCalledWith({
      clerkUserId: "clerk-1",
      sessionId: null,
    });
  });

  it("session_idが複数指定されていれば、session_id無しとして扱う", async () => {
    await expect(
      renderPage({ session_id: [SESSION_ID, SESSION_ID] })
    ).rejects.toThrow("NEXT_REDIRECT:/onboarding/account-type");
    expect(findPaymentCompleted).toHaveBeenCalledWith({
      clerkUserId: "clerk-1",
      sessionId: null,
    });
  });

  it("未ログインなら決済を確かめずに種別選択へ戻す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    await expect(renderPage({ session_id: SESSION_ID })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );
    expect(findPaymentCompleted).not.toHaveBeenCalled();
  });

  it("決済の完了を確かめられなければ（Stripe・DBの失敗）、Sentryに送り、確定待ちも種別選択も出さず再読み込みを促す", async () => {
    const error = new Error("stripe down");
    findPaymentCompleted.mockRejectedValue(error);

    const html = renderToStaticMarkup(
      (await renderPage({ session_id: SESSION_ID })) as ReactElement
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ page: "onboarding-payment-success" }),
        extra: expect.objectContaining({
          clerkUserId: "clerk-1",
          sessionId: SESSION_ID,
        }),
      })
    );
    expect(html).toContain("再読み込み");
    expect(html).not.toContain("処理中");
  });
});
