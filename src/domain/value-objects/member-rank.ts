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

// 個別契約のランク。セルフサービス（入会・決済）の対象外で、掛け率・ランク別価格も設定しない（FR-006）
const INDIVIDUAL_CONTRACT_RANKS = ["enterprise"] as const;
type IndividualContractRankValue = (typeof INDIVIDUAL_CONTRACT_RANKS)[number];

/** セルフサービスで選べるランク */
export type SelfServiceRankValue = Exclude<
  MemberRankValue,
  IndividualContractRankValue
>;
/** 掛け率・ランク別価格を設定するランク */
export type PricingRankValue = Exclude<
  MemberRankValue,
  IndividualContractRankValue
>;

function isIndividualContract(rank: MemberRankValue): boolean {
  return (INDIVIDUAL_CONTRACT_RANKS as readonly string[]).includes(rank);
}

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

  /** セルフサービスで選べるランクの一覧（下位から順）。ENTERPRISEは個別契約のため含まない（FR-006） */
  static selfServiceRanks(): SelfServiceRankValue[] {
    return RANK_ORDER.filter(
      (rank): rank is SelfServiceRankValue => !isIndividualContract(rank)
    );
  }

  /** 掛け率・ランク別価格を設定するランクの一覧（下位から順）。ENTERPRISEは個別契約のため含まない */
  static pricingRanks(): PricingRankValue[] {
    return RANK_ORDER.filter(
      (rank): rank is PricingRankValue => !isIndividualContract(rank)
    );
  }

  /** セルフサービスで申し込めるランクか（入会のCheckoutのmetadataの検証に使う） */
  static isSelfServiceRank(value: string): value is MemberRankValue {
    return (MemberRank.selfServiceRanks() as string[]).includes(value);
  }

  static of(value: string): MemberRank {
    if (!(RANK_ORDER as readonly string[]).includes(value)) {
      throw new Error(`不正なランク値: ${value}`);
    }
    return new MemberRank(value as MemberRankValue);
  }

  /** セルフサービス（入会・決済）で選べるランクか。true なら value は SelfServiceRankValue に絞られる */
  isSelfService(): this is MemberRank & {
    readonly value: SelfServiceRankValue;
  } {
    return !isIndividualContract(this.value);
  }

  /** 掛け率・ランク別価格を設定するランクか */
  hasRankPricing(): boolean {
    return !isIndividualContract(this.value);
  }

  getMonthlyLimit(): Money {
    return Money.of(MONTHLY_LIMITS[this.value]);
  }

  canAccess(minRank: MemberRank): boolean {
    return RANK_ORDER.indexOf(this.value) >= RANK_ORDER.indexOf(minRank.value);
  }

  /** このランクで閲覧できるランクの一覧（最下位から自ランクまで） */
  accessibleRanks(): MemberRankValue[] {
    return RANK_ORDER.slice(0, RANK_ORDER.indexOf(this.value) + 1);
  }

  isHigherThan(other: MemberRank): boolean {
    return RANK_ORDER.indexOf(this.value) > RANK_ORDER.indexOf(other.value);
  }
}
