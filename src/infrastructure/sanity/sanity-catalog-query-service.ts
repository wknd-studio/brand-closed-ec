import { sanityClient } from "@/infrastructure/sanity/client";
import type {
  BrandSummaryDto,
  CatalogQueryService,
  CheckoutProductDto,
  FavoriteProductDto,
  ProductAvailability,
  ProductCardDto,
  ProductDetailDto,
  ProductListDto,
  ProductPaymentTiming,
} from "@/queries/catalog-query-service";
import {
  MemberRank,
  type MemberRankValue,
} from "@/domain/value-objects/member-rank";
import { RankPrices } from "@/domain/value-objects/rank-prices";

const PAGE_SIZE = 12;

type SanityPricing = {
  is_negotiable: boolean;
  prices: Partial<Record<MemberRankValue, number>> | null;
  min_rank: string;
};

type SanityProduct = SanityPricing & {
  _id: string;
  name: string;
  brand: string;
  retail_price: number;
  availability: ProductAvailability;
  thumbnail: string | null;
  // 本機能追加前に作成された既存商品ドキュメントにはフィールド自体が存在しないため null が返り得る
  payment_timing: ProductPaymentTiming | null;
};

type SanityProductDetail = Omit<SanityProduct, "thumbnail"> & {
  categories: string[] | null;
  description: unknown[] | null;
  images: (string | null)[] | null;
  files: { label: string | null; url: string }[] | null;
};

const CARD_PROJECTION = `{_id,name,"brand":brand->name,retail_price,is_negotiable,prices,min_rank,availability,"thumbnail":images[0].asset->url,payment_timing}`;

// 閲覧できるランクの商品だけにし、販売終了の商品を除く（一覧・検索・ブランド一覧で共通）
const LISTABLE_FILTER = `_type=="product"&&min_rank in $allowedRanks&&availability!="discontinued"`;

function priceFor(product: SanityPricing, rank: MemberRank): number | null {
  return (
    RankPrices.of({
      isNegotiable: product.is_negotiable,
      prices: product.prices,
    }).priceFor(rank)?.amount ?? null
  );
}

function canAccess(product: SanityPricing, rank: MemberRank): boolean {
  return rank.canAccess(MemberRank.of(product.min_rank));
}

function toCardDto(
  product: SanityProduct,
  unitPrice: number | null
): ProductCardDto {
  return {
    id: product._id,
    name: product.name,
    brand: product.brand,
    retailPrice: product.retail_price,
    isNegotiable: product.is_negotiable,
    unitPrice,
    availability: product.availability,
    thumbnail: product.thumbnail,
  };
}

export class SanityCatalogQueryService implements CatalogQueryService {
  async findBrands(rank: MemberRank): Promise<BrandSummaryDto[]> {
    const rows = await sanityClient.fetch<
      { brand: string; thumbnail: string | null }[]
    >(
      `*[${LISTABLE_FILTER}]|order(brand->name asc){"brand":brand->name,"thumbnail":images[0].asset->url}`,
      { allowedRanks: rank.accessibleRanks() }
    );
    const brandMap = new Map<
      string,
      { count: number; thumbnail: string | null }
    >();
    for (const row of rows) {
      if (!brandMap.has(row.brand))
        brandMap.set(row.brand, { count: 0, thumbnail: row.thumbnail });
      brandMap.get(row.brand)!.count++;
    }
    return Array.from(brandMap.entries())
      .map(([brand, { count, thumbnail }]) => ({ brand, count, thumbnail }))
      .sort((a, b) => a.brand.localeCompare(b.brand, "ja"));
  }

  async findProducts({
    rank,
    brand,
    keyword,
    offset = 0,
  }: {
    rank: MemberRank;
    brand?: string;
    keyword?: string;
    offset?: number;
  }): Promise<ProductListDto> {
    const conditions = [LISTABLE_FILTER];
    if (brand) conditions.push(`brand->name==$brand`);
    if (keyword)
      conditions.push(`(name match $keyword || brand->name match $keyword)`);
    const filter = conditions.join("&&");
    const params = {
      allowedRanks: rank.accessibleRanks(),
      ...(brand ? { brand } : {}),
      ...(keyword ? { keyword: `*${keyword}*` } : {}),
    };

    const [products, total] = await Promise.all([
      sanityClient.fetch<SanityProduct[]>(
        `*[${filter}]|order(_createdAt desc)[$start...$end]${CARD_PROJECTION}`,
        { ...params, start: offset, end: offset + PAGE_SIZE - 1 }
      ),
      sanityClient.fetch<number>(`count(*[${filter}])`, params),
    ]);
    return {
      products: products.map((p) => toCardDto(p, priceFor(p, rank))),
      total,
    };
  }

  async findProductDetail({
    rank,
    productId,
  }: {
    rank: MemberRank;
    productId: string;
  }): Promise<ProductDetailDto | null> {
    const product = await sanityClient.fetch<SanityProductDetail | null>(
      `*[_type=="product"&&_id==$id][0]{_id,name,"brand":brand->name,"categories":categories[]->name,description,retail_price,is_negotiable,prices,min_rank,availability,"images":images[].asset->url,"files":files[]{label,"url":asset->url},payment_timing}`,
      { id: productId }
    );
    if (!product || !canAccess(product, rank)) return null;

    return {
      id: product._id,
      name: product.name,
      brand: product.brand,
      categories: product.categories ?? [],
      description: product.description,
      retailPrice: product.retail_price,
      isNegotiable: product.is_negotiable,
      unitPrice: priceFor(product, rank),
      availability: product.availability,
      images: (product.images ?? []).filter((url): url is string => !!url),
      files: product.files ?? [],
      paymentTiming: product.payment_timing ?? "at_order",
    };
  }

  async findFavoriteProducts({
    rank,
    productIds,
  }: {
    rank: MemberRank;
    productIds: string[];
  }): Promise<FavoriteProductDto[]> {
    const productById = new Map(
      (await this.fetchByIds(productIds)).map((p) => [p._id, p])
    );
    return productIds
      .map((id) => productById.get(id))
      .filter((product) => product !== undefined)
      .map((product) => {
        const isAccessible = canAccess(product, rank);
        return {
          product: toCardDto(
            product,
            isAccessible ? priceFor(product, rank) : null
          ),
          isAccessible,
        };
      });
  }

  async findCheckoutProducts({
    rank,
    productIds,
  }: {
    rank: MemberRank;
    productIds: string[];
  }): Promise<CheckoutProductDto[]> {
    return (await this.fetchByIds(productIds)).map((product) => ({
      id: product._id,
      name: product.name,
      thumbnail: product.thumbnail,
      unitPrice: priceFor(product, rank),
      isOutOfStock: product.availability === "out_of_stock",
      // 後方互換: payment_timing 未設定の既存商品は at_order（従来の checkout フロー相当）として扱う
      paymentTiming: product.payment_timing ?? "at_order",
    }));
  }

  private async fetchByIds(ids: string[]): Promise<SanityProduct[]> {
    if (ids.length === 0) return [];
    return sanityClient.fetch<SanityProduct[]>(
      `*[_type=="product"&&_id in $ids]${CARD_PROJECTION}`,
      { ids }
    );
  }
}
