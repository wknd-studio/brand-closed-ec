import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/use-cases/select-plan", () => ({
  selectPlan: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));
vi.mock("@/infrastructure/clerk/clerk-account-gateway", () => ({
  ClerkAccountGateway: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { selectPlan as selectPlanUseCase } from "@/use-cases/select-plan";
import { selectPlan } from "@/app/onboarding/plan/actions";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import { MissingRequiredProfileFieldsError } from "@/domain/errors/missing-required-profile-fields-error";

function corporateFormData(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    accountType: "corporate",
    plan: "standard",
    lastName: "山田",
    firstName: "太郎",
    phoneNumber: "090-1234-5678",
    companyName: "テスト株式会社",
    invoiceRegistrationNumber: "T1234567890123",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

const expectedValues = {
  plan: "standard",
  lastName: "山田",
  firstName: "太郎",
  phoneNumber: "090-1234-5678",
  companyName: "テスト株式会社",
  invoiceRegistrationNumber: "T1234567890123",
};

describe("selectPlan Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@example.com" }],
    } as never);
  });

  it("必須項目が不足している場合は項目ごとのエラーと入力値を返し、Sentryには送らない", async () => {
    vi.mocked(selectPlanUseCase).mockRejectedValue(
      new MissingRequiredProfileFieldsError(["lastName", "companyName"])
    );

    const result = await selectPlan(null, corporateFormData());

    expect(result).toEqual({
      fieldErrors: {
        lastName: "姓を入力してください",
        companyName: "会社名を入力してください",
      },
      values: expectedValues,
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("電話番号の形式エラーではエラーと入力値を返し、Sentryには送らない", async () => {
    vi.mocked(selectPlanUseCase).mockRejectedValue(
      new InvalidPhoneNumberError("090-1234-5678")
    );

    const result = await selectPlan(null, corporateFormData());

    expect(result).toEqual({
      error: "電話番号の形式が正しくありません",
      values: expectedValues,
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("無効なプランの場合もエラーと入力値を返す", async () => {
    const result = await selectPlan(
      null,
      corporateFormData({ plan: "enterprise" })
    );

    expect(result).toEqual({
      error: "無効なプランです",
      values: { ...expectedValues, plan: "enterprise" },
    });
    expect(selectPlanUseCase).not.toHaveBeenCalled();
  });

  it("想定外の例外はSentryに送り、汎用エラーと入力値を返す", async () => {
    const error = new Error("DB接続エラー");
    vi.mocked(selectPlanUseCase).mockRejectedValue(error);

    const result = await selectPlan(null, corporateFormData());

    expect(result).toEqual({
      error: "ユーザーレコードの作成に失敗しました",
      values: expectedValues,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { action: "selectPlan" },
        extra: { clerkUserId: "clerk-1" },
      })
    );
  });

  it("個人の場合は会社名・インボイス番号をユースケースに渡さない", async () => {
    vi.mocked(selectPlanUseCase).mockResolvedValue({
      redirectTo: "/onboarding/payment",
    });
    const formData = corporateFormData();
    formData.delete("accountType");

    const result = await selectPlan(null, formData);

    expect(result).toEqual({ redirectTo: "/onboarding/payment" });
    expect(vi.mocked(selectPlanUseCase).mock.calls[0][0]).toMatchObject({
      companyName: undefined,
      invoiceRegistrationNumber: undefined,
    });
  });
});
