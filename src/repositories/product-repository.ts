import type { Money } from "@/domain/value-objects/money";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

export interface ProductSnapshot {
  sanityProductId: string;
  productName: string;
  unitPrice: Money;
  isNegotiable: boolean;
  minRank: MemberRankValue;
  paymentTiming: "at_order" | "after_order";
}

export interface ProductRepository {
  findByIds(ids: string[], rank: MemberRankValue): Promise<ProductSnapshot[]>;
}
