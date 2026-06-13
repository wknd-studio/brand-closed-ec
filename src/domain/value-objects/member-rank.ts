import { Money } from "./money";

export const RANK_ORDER = [
  "free",
  "entry",
  "standard",
  "pro",
  "enterprise",
] as const;

export type MemberRankValue = (typeof RANK_ORDER)[number];

const MONTHLY_LIMITS: Record<MemberRankValue, number> = {
  free: 300_000,
  entry: 1_000_000,
  standard: 5_000_000,
  pro: 20_000_000,
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
