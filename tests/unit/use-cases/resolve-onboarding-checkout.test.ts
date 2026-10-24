import { describe, it, expect, vi } from "vitest";
import { resolveOnboardingCheckout } from "@/use-cases/resolve-onboarding-checkout";
import { MemberType } from "@/domain/value-objects/member-type";
import { makeUserRepo, makeUser } from "./helpers";

const RESTART = { redirectTo: "/onboarding/account-type" };

describe("resolveOnboardingCheckout", () => {
  it("DBに保存したrank_codeで決済する", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(
      makeUser({ rank: "premium", onboardingCompleted: false })
    );

    const result = await resolveOnboardingCheckout("clerk-1", { userRepo });

    expect(result).toEqual({
      user: expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000001",
      }),
      rank: "premium",
    });
  });

  it("usersの行が無い（プラン未選択）場合: 種別選択へ戻す", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    const result = await resolveOnboardingCheckout("clerk-1", { userRepo });

    expect(result).toEqual(RESTART);
  });

  it.each([
    ["姓", { lastName: "" }],
    ["名", { firstName: "" }],
    ["電話番号", { phoneNumber: "" }],
  ])("%sが未入力の場合: 種別選択へ戻す", async (_label, overrides) => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(
      makeUser({ ...overrides, onboardingCompleted: false })
    );

    const result = await resolveOnboardingCheckout("clerk-1", { userRepo });

    expect(result).toEqual(RESTART);
  });

  it("法人で会社名が未入力の場合: 種別選択へ戻す", async () => {
    // Userエンティティは法人の会社名欠落を生成時に弾くため、
    // DBの行を読んだ結果を模したオブジェクトで判定だけを確認する
    const user = Object.assign(
      Object.create(Object.getPrototypeOf(makeUser())),
      makeUser({ onboardingCompleted: false }),
      { memberType: MemberType.of("corporate"), companyName: "" }
    );
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(user);

    const result = await resolveOnboardingCheckout("clerk-1", { userRepo });

    expect(result).toEqual(RESTART);
  });

  it("セルフサービスで決済できないランク（enterprise）の場合: 種別選択へ戻す", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(
      makeUser({ rank: "enterprise", onboardingCompleted: false })
    );

    const result = await resolveOnboardingCheckout("clerk-1", { userRepo });

    expect(result).toEqual(RESTART);
  });
});
