import { sanityClient } from "@/lib/sanity/client";
import type {
  ProductRepository,
  ProductSnapshot,
} from "@/repositories/product-repository";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";
import { ProductPriceNotSetError } from "@/domain/errors/product-price-not-set-error";

type SanityProduct = {
  _id: string;
  name: string;
  is_negotiable: boolean;
  prices: Partial<Record<MemberRankValue, number>> | null;
  min_rank: string;
  payment_timing: "at_order" | "after_order";
};

export class SanityProductRepository implements ProductRepository {
  async findByIds(
    ids: string[],
    rank: MemberRankValue
  ): Promise<ProductSnapshot[]> {
    if (ids.length === 0) return [];

    const products = await sanityClient.fetch<SanityProduct[]>(
      `*[_type=="product"&&_id in $ids]{_id,name,is_negotiable,prices,min_rank,payment_timing}`,
      { ids }
    );

    return products.map((p) => {
      const unitPrice = p.is_negotiable ? 0 : p.prices?.[rank];
      if (unitPrice == null) {
        throw new ProductPriceNotSetError(p._id, rank);
      }
      return {
        sanityProductId: p._id,
        productName: p.name,
        unitPrice: Money.of(unitPrice),
        isNegotiable: p.is_negotiable,
        minRank: p.min_rank as MemberRankValue,
        paymentTiming: p.payment_timing,
      };
    });
  }
}
