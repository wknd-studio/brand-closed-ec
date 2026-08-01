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
  // 本機能追加前に作成された既存商品ドキュメントにはフィールド自体が存在しないため
  // null/undefinedが返り得る（Sanity StudioのinitialValueは新規作成時のみ適用され、
  // 既存ドキュメントには遡及しないため）
  payment_timing: "at_order" | "after_order" | null | undefined;
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
        // 後方互換: payment_timing未設定の既存商品はat_order（従来のcheckoutフロー相当）として扱う
        paymentTiming: p.payment_timing ?? "at_order",
      };
    });
  }
}
