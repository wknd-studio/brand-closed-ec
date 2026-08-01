import { sanityClient } from "./client";
import { RANK_ORDER } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

export type MemberRank = MemberRankValue;

export function getAllowedRanks(userRank: string): string[] {
  const idx = RANK_ORDER.indexOf(userRank as MemberRank);
  if (idx === -1) return [RANK_ORDER[0]];
  return [...RANK_ORDER].slice(0, idx + 1);
}

export function isProductAccessible(
  userRank: string,
  productMinRank: string
): boolean {
  const userIdx = RANK_ORDER.indexOf(userRank as MemberRank);
  const minIdx = RANK_ORDER.indexOf(productMinRank as MemberRank);
  if (userIdx === -1 || minIdx === -1) return false;
  return userIdx >= minIdx;
}

export const PAGE_SIZE = 12;

export type BrandSummary = {
  brand: string;
  count: number;
  thumbnail: string | null;
};
export type Product = {
  _id: string;
  name: string;
  brand: string;
  retail_price: number;
  is_negotiable: boolean;
  prices: Partial<Record<MemberRank, number>> | null;
  min_rank: string;
  availability: string;
  thumbnail: string | null;
  payment_timing: "at_order" | "after_order" | null;
};
export type ProductDetail = {
  _id: string;
  name: string;
  brand: string;
  categories: string[] | null;
  description: unknown[] | null;
  retail_price: number;
  is_negotiable: boolean;
  prices: Partial<Record<MemberRank, number>> | null;
  min_rank: string;
  availability: string;
  images: string[] | null;
  files: { label: string | null; url: string }[] | null;
  payment_timing: "at_order" | "after_order" | null;
};

export async function fetchBrands(
  allowedRanks: string[]
): Promise<BrandSummary[]> {
  const rows = await sanityClient.fetch<
    { brand: string; thumbnail: string | null }[]
  >(
    `*[_type=="product"&&min_rank in $allowedRanks&&availability!="discontinued"]|order(brand->name asc){"brand":brand->name,"thumbnail":images[0].asset->url}`,
    { allowedRanks }
  );
  const brandMap = new Map<string, { count: number; thumbnail: string | null }>(
    []
  );
  for (const row of rows) {
    if (!brandMap.has(row.brand))
      brandMap.set(row.brand, { count: 0, thumbnail: row.thumbnail });
    brandMap.get(row.brand)!.count++;
  }
  return Array.from(brandMap.entries())
    .map(([brand, { count, thumbnail }]) => ({ brand, count, thumbnail }))
    .sort((a, b) => a.brand.localeCompare(b.brand, "ja"));
}

export async function fetchProductById(
  id: string
): Promise<ProductDetail | null> {
  return sanityClient.fetch<ProductDetail | null>(
    `*[_type=="product"&&_id==$id][0]{_id,name,"brand":brand->name,"categories":categories[]->name,description,retail_price,is_negotiable,prices,min_rank,availability,"images":images[].asset->url,"files":files[]{label,"url":asset->url},payment_timing}`,
    { id }
  );
}

export async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  return sanityClient.fetch<Product[]>(
    `*[_type=="product"&&_id in $ids]{_id,name,"brand":brand->name,retail_price,is_negotiable,prices,min_rank,availability,"thumbnail":images[0].asset->url,payment_timing}`,
    { ids }
  );
}

export async function fetchProducts({
  allowedRanks,
  brand,
  offset = 0,
}: {
  allowedRanks: string[];
  brand: string;
  offset?: number;
}): Promise<{ products: Product[]; total: number }> {
  const [products, total] = await Promise.all([
    sanityClient.fetch<Product[]>(
      `*[_type=="product"&&min_rank in $allowedRanks&&availability!="discontinued"&&brand->name==$brand]|order(_createdAt desc)[$start...$end]{_id,name,"brand":brand->name,retail_price,is_negotiable,prices,min_rank,availability,"thumbnail":images[0].asset->url}`,
      { allowedRanks, brand, start: offset, end: offset + PAGE_SIZE - 1 }
    ),
    sanityClient.fetch<number>(
      `count(*[_type=="product"&&min_rank in $allowedRanks&&availability!="discontinued"&&brand->name==$brand])`,
      { allowedRanks, brand }
    ),
  ]);
  return { products, total };
}
