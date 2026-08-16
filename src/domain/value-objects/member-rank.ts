import { Money } from "./money";

export const RANK_ORDER = [
  "starter",
  "basic",
  "standard",
  "pro",
  "advanced",
  "premium",
  "enterprise",
] as const;

export type MemberRankValue = (typeof RANK_ORDER)[number];

// TODO: 月間仕入れ上限は未確定（TBD）の暫定値。確定次第更新する
// （specs/001-seven-rank-pricing/research.md参照）。
// standard/pro/enterpriseは名称が旧モデルから引き継がれるため、旧モデルの数値を
// そのまま流用した（starter/basic/advanced/premiumは新規ランクのため新規に暫定設定）。
// 同じ値をsupabase/migrations/20260816151000_create_member_ranks.sqlの
// member_ranks.monthly_limit_amountにも投入している。DB参照化するまでは
// 二重管理になるため、値を変える場合は両方揃えること。
const MONTHLY_LIMITS: Record<MemberRankValue, number> = {
  starter: 300_000,
  basic: 1_000_000,
  standard: 5_000_000,
  pro: 20_000_000,
  advanced: 50_000_000,
  premium: 100_000_000,
  enterprise: Number.MAX_SAFE_INTEGER,
};

export class MemberRank {
  private constructor(readonly value: MemberRankValue) {}

  static of(value: string): MemberRank {
    if (!(RANK_ORDER as readonly string[]).includes(value)) {
      throw new Error(`不正なランク値: ${value}`);
    }
    return new MemberRank(value as MemberRankValue);
  }

  getMonthlyLimit(): Money {
    return Money.of(MONTHLY_LIMITS[this.value]);
  }

  canAccess(minRank: MemberRank): boolean {
    return RANK_ORDER.indexOf(this.value) >= RANK_ORDER.indexOf(minRank.value);
  }

  isHigherThan(other: MemberRank): boolean {
    return RANK_ORDER.indexOf(this.value) > RANK_ORDER.indexOf(other.value);
  }

  equals(other: MemberRank): boolean {
    return this.value === other.value;
  }
}
