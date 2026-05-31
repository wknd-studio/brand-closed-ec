import { sanityClient } from "./client";

export const RANK_ORDER = [
  "free",
  "entry",
  "standard",
  "pro",
  "enterprise",
] as const;
export type MemberRank = (typeof RANK_ORDER)[number];

export function getAllowedRanks(userRank: string): string[] {
  const idx = RANK_ORDER.indexOf(userRank as MemberRank);
  if (idx === -1) return ["free"];
  return [...RANK_ORDER].slice(0, idx + 1);
}

export const PAGE_SIZE = 12;

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
};

export async function fetchProducts({
  allowedRanks,
  offset = 0,
}: {
  allowedRanks: string[];
  offset?: number;
}): Promise<{ products: Product[]; total: number }> {
  const [products, total] = await Promise.all([
    sanityClient.fetch<Product[]>(
      `*[
        _type == "product" &&
        min_rank in $allowedRanks &&
        availability != "discontinued"
      ] | order(_createdAt desc) [$start...$end] {
        _id, name, brand, retail_price, is_negotiable, prices, min_rank, availability,
        "thumbnail": images[0].asset->url
      }`,
      { allowedRanks, start: offset, end: offset + PAGE_SIZE - 1 }
    ),
    sanityClient.fetch<number>(
      `count(*[
        _type == "product" &&
        min_rank in $allowedRanks &&
        availability != "discontinued"
      ])`,
      { allowedRanks }
    ),
  ]);

  return { products, total };
}
