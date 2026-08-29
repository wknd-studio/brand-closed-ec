import { describe, it, expect } from "vitest";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";

function makeUser(overrides: Partial<Parameters<typeof User.of>[0]> = {}) {
  return User.of({
    id: "user-001",
    clerkUserId: "clerk_abc123",
    email: "test@example.com",
    firstName: "太郎",
    lastName: "山田",
    phoneNumber: "09012345678",
    profileCompletedAt: new Date(2026, 0, 10),
    rank: MemberRank.of("basic"),
    billingAnchorDay: 10,
    onboardingCompleted: true,
    deletedAt: null,
    stripeCustomerId: null,
    ...overrides,
  });
}

describe("User", () => {
  describe("getMonthlyPeriod()", () => {
    it("billingAnchorDayを基準にした月次期間を返す", () => {
      const user = makeUser({ billingAnchorDay: 10 });
      const now = new Date(2026, 5, 15);
      const period = user.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 10));
      expect(period.end).toEqual(new Date(2026, 6, 10));
    });

    it("billingAnchorDayがnullのとき当月1日〜翌月1日", () => {
      const user = makeUser({ billingAnchorDay: null });
      const now = new Date(2026, 5, 15);
      const period = user.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 1));
      expect(period.end).toEqual(new Date(2026, 6, 1));
    });
  });

  describe("getMonthlyLimit()", () => {
    it("ランクに対応した月次上限 Money を返す", () => {
      const user = makeUser({ rank: MemberRank.of("standard") });
      expect(user.getMonthlyLimit().amount).toBe(5_000_000);
    });
  });

  describe("isWithdrawn()", () => {
    it("deletedAt が null のとき false", () => {
      expect(makeUser({ deletedAt: null }).isWithdrawn()).toBe(false);
    });

    it("deletedAt が設定されているとき true", () => {
      expect(makeUser({ deletedAt: new Date(2026, 0, 1) }).isWithdrawn()).toBe(
        true
      );
    });
  });

  describe("hasCompletedProfile()", () => {
    it("氏名・電話番号がすべて入力済みのとき true", () => {
      expect(
        makeUser({
          firstName: "太郎",
          lastName: "山田",
          phoneNumber: "09012345678",
        }).hasCompletedProfile()
      ).toBe(true);
    });

    it("電話番号が空のとき false", () => {
      expect(
        makeUser({
          firstName: "太郎",
          lastName: "山田",
          phoneNumber: "",
        }).hasCompletedProfile()
      ).toBe(false);
    });

    it("氏名が空のとき false", () => {
      expect(
        makeUser({
          firstName: "",
          lastName: "",
          phoneNumber: "09012345678",
        }).hasCompletedProfile()
      ).toBe(false);
    });
  });

  describe("hasCompletedOnboarding()", () => {
    it("onboardingCompleted が true のとき true", () => {
      expect(
        makeUser({ onboardingCompleted: true }).hasCompletedOnboarding()
      ).toBe(true);
    });

    it("onboardingCompleted が false のとき false", () => {
      expect(
        makeUser({ onboardingCompleted: false }).hasCompletedOnboarding()
      ).toBe(false);
    });
  });
});
