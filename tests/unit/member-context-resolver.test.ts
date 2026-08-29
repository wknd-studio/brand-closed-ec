import { describe, it, expect } from "vitest";
import { resolveMemberContext } from "@/domain/services/member-context-resolver";
import { User } from "@/domain/entities/user";
import { Organization } from "@/domain/entities/organization";
import { MemberRank } from "@/domain/value-objects/member-rank";

function makeUser(rankValue: string): User {
  return User.of({
    id: "user-1",
    clerkUserId: "clerk-1",
    email: "test@example.com",
    firstName: "太郎",
    lastName: "山田",
    phoneNumber: "09012345678",
    profileCompletedAt: new Date(2026, 0, 1),
    rank: MemberRank.of(rankValue),
    billingAnchorDay: 1,
    onboardingCompleted: true,
    deletedAt: null,
    stripeCustomerId: null,
  });
}

function makeOrganization(rankValue: string): Organization {
  return Organization.of({
    id: "org-1",
    clerkOrgId: "org_abc",
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
    rank: MemberRank.of(rankValue),
    billingAnchorDay: 1,
    stripeCustomerId: null,
    initialFeePaidRank: null,
    deletedAt: null,
  });
}

describe("resolveMemberContext", () => {
  it("activeOrganizationがnullのとき、個人会員としてuser.rankを返す", () => {
    const user = makeUser("standard");
    const context = resolveMemberContext(user, null);
    expect(context.scope).toBe("individual");
    expect(context.rank.value).toBe("standard");
    expect(context.monthlyLimit.amount).toBe(
      MemberRank.of("standard").getMonthlyLimit().amount
    );
  });

  it("activeOrganizationが指定されるとき、組織スコープでorganization.rankを返す", () => {
    const user = makeUser("starter");
    const org = makeOrganization("pro");
    const context = resolveMemberContext(user, org);
    expect(context.scope).toBe("organization");
    expect(context.rank.value).toBe("pro");
    expect(context.monthlyLimit.amount).toBe(
      MemberRank.of("pro").getMonthlyLimit().amount
    );
    if (context.scope === "organization") {
      expect(context.organizationId).toBe("org-1");
    }
  });
});
