import { describe, it, expect } from "vitest";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";

function makeUser(overrides: Partial<Parameters<typeof User.of>[0]> = {}) {
  return User.of({
    id: "user-001",
    clerkUserId: "clerk_abc123",
    email: "test@example.com",
    rank: MemberRank.of("entry"),
    subscribedAt: new Date(2026, 0, 10),
    onboardingCompleted: true,
    termsAgreedAt: new Date(2026, 0, 10),
    termsVersion: "v1",
    deletedAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    ...overrides,
  });
}

describe("User", () => {
  describe("getMonthlyPeriod()", () => {
    it("subscribedAt の日付を基準にした月次期間を返す", () => {
      const user = makeUser({ subscribedAt: new Date(2026, 0, 10) });
      const now = new Date(2026, 5, 15);
      const period = user.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 10));
      expect(period.end).toEqual(new Date(2026, 6, 10));
    });

    it("subscribedAt が null のとき当月1日〜翌月1日", () => {
      const user = makeUser({ subscribedAt: null });
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
