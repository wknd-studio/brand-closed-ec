import type { User } from "@/domain/entities/user";
import type { Organization } from "@/domain/entities/organization";
import type { MemberRank } from "@/domain/value-objects/member-rank";
import type { Money } from "@/domain/value-objects/money";

export type MemberContext =
  | {
      scope: "individual";
      rank: MemberRank;
      monthlyLimit: Money;
    }
  | {
      scope: "organization";
      rank: MemberRank;
      monthlyLimit: Money;
      organizationId: string;
    };

// FR-022, FR-024, R11: 会員ランク・月次上限の参照をこの関数経由に一元化する。
// activeOrganizationがnullなら個人会員としてuser.rankをそのまま返し、
// 指定されていれば組織スコープでorganization.rankを返す（user.rankは一切参照しない）。
export function resolveMemberContext(
  user: User,
  activeOrganization: Organization | null
): MemberContext {
  if (activeOrganization === null) {
    return {
      scope: "individual",
      rank: user.rank,
      monthlyLimit: user.getMonthlyLimit(),
    };
  }

  return {
    scope: "organization",
    rank: activeOrganization.rank,
    monthlyLimit: activeOrganization.getMonthlyLimit(),
    organizationId: activeOrganization.id,
  };
}
