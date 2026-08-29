import { describe, it, expect } from "vitest";
import { Organization } from "@/domain/entities/organization";
import { MemberRank } from "@/domain/value-objects/member-rank";

function makeOrganization(
  overrides: Partial<Parameters<typeof Organization.of>[0]> = {}
) {
  return Organization.of({
    id: "org-001",
    clerkOrgId: "org_abc123",
    name: "株式会社テスト",
    representativeName: "山田太郎",
    phoneNumber: "0312345678",
    postalCode: "1000001",
    prefecture: "東京都",
    city: "千代田区",
    addressLine1: "1-1-1",
    addressLine2: null,
    invoiceRegistrationNumber: "T1234567890123",
    onboardingCompleted: true,
    rank: MemberRank.of("standard"),
    billingAnchorDay: 10,
    stripeCustomerId: null,
    initialFeePaidRank: null,
    deletedAt: null,
    ...overrides,
  });
}

describe("Organization", () => {
  describe("getMonthlyPeriod()", () => {
    it("billingAnchorDayを基準にした月次期間を返す", () => {
      const org = makeOrganization({ billingAnchorDay: 10 });
      const now = new Date(2026, 5, 15);
      const period = org.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 10));
      expect(period.end).toEqual(new Date(2026, 6, 10));
    });

    it("billingAnchorDayがnullのとき当月1日〜翌月1日", () => {
      const org = makeOrganization({ billingAnchorDay: null });
      const now = new Date(2026, 5, 15);
      const period = org.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 1));
      expect(period.end).toEqual(new Date(2026, 6, 1));
    });
  });

  describe("getMonthlyLimit()", () => {
    it("ランクに対応した月次上限 Money を返す", () => {
      const org = makeOrganization({ rank: MemberRank.of("standard") });
      expect(org.getMonthlyLimit().amount).toBe(5_000_000);
    });
  });

  describe("isClosed()", () => {
    it("deletedAtがnullのときfalse", () => {
      expect(makeOrganization({ deletedAt: null }).isClosed()).toBe(false);
    });

    it("deletedAtが設定されているときtrue", () => {
      expect(
        makeOrganization({ deletedAt: new Date(2026, 0, 1) }).isClosed()
      ).toBe(true);
    });
  });
});
