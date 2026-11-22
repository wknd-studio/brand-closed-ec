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

export class MemberRank {
  private constructor(readonly value: MemberRankValue) {}

  /** 全ランクの一覧（下位から順）。個別契約のENTERPRISEも含む */
  static allRanks(): MemberRankValue[] {
    return [...RANK_ORDER];
  }

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
