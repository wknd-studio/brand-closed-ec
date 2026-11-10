import type { MemberRank } from "@/domain/value-objects/member-rank";

export type ProductAvailability = "available" | "out_of_stock" | "discontinued";
export type ProductPaymentTiming = "at_order" | "after_order";

// ブランド一覧（/shop）の1ブランド。閲覧できる商品の件数と、最初の商品のサムネイル
export type BrandSummaryDto = {
  brand: string;
  count: number;
  thumbnail: string | null;
};

// 商品一覧・検索・お気に入りの商品カード。unitPrice は会員ランクの価格（要相談・未設定は null）
export type ProductCardDto = {
  id: string;
  name: string;
  brand: string;
  retailPrice: number;
  isNegotiable: boolean;
  unitPrice: number | null;
  availability: ProductAvailability;
  thumbnail: string | null;
};

export type ProductListDto = {
  products: ProductCardDto[];
  total: number;
};

// 商品詳細（/shop/[brand]/[id]）
export type ProductDetailDto = {
  id: string;
  name: string;
  brand: string;
  categories: string[];
  description: unknown[] | null;
  retailPrice: number;
  isNegotiable: boolean;
  unitPrice: number | null;
  availability: ProductAvailability;
  images: string[];
  files: { label: string | null; url: string }[];
  paymentTiming: ProductPaymentTiming;
};

// お気に入り一覧（/favorites）。閲覧できない商品は価格を持たない
export type FavoriteProductDto = {
  product: ProductCardDto;
  isAccessible: boolean;
};

// 注文確認画面（/order/checkout）のカートの商品の最新の状態
export type CheckoutProductDto = {
  id: string;
  name: string;
  thumbnail: string | null;
  unitPrice: number | null;
  isOutOfStock: boolean;
  paymentTiming: ProductPaymentTiming;
};

// 商品カタログの読み取り。閲覧できるランクの絞り込みとランク別価格の選択は、会員ランク（rank）から実装の中で行う
export interface CatalogQueryService {
  // 閲覧できる商品（販売終了を除く）があるブランド
  findBrands(rank: MemberRank): Promise<BrandSummaryDto[]>;
  // 商品一覧・検索。閲覧できないランクの商品・販売終了の商品は含めない
  findProducts(input: {
    rank: MemberRank;
    brand?: string;
    keyword?: string;
    offset?: number;
  }): Promise<ProductListDto>;
  // 存在しない商品・閲覧できないランクの商品は null
  findProductDetail(input: {
    rank: MemberRank;
    productId: string;
  }): Promise<ProductDetailDto | null>;
  // productIds の並び順を保つ。Sanity で削除済みの商品は除く
  findFavoriteProducts(input: {
    rank: MemberRank;
    productIds: string[];
  }): Promise<FavoriteProductDto[]>;
  // Sanity で削除済みの商品は含めない
  findCheckoutProducts(input: {
    rank: MemberRank;
    productIds: string[];
  }): Promise<CheckoutProductDto[]>;
}
