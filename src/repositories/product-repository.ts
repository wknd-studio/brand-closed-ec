import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { ProductSnapshot } from "@/domain/value-objects/product-snapshot";

export type { ProductSnapshot };

export interface ProductRepository {
  findByIds(ids: string[], rank: MemberRankValue): Promise<ProductSnapshot[]>;
}
