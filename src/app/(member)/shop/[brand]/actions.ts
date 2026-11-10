"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { catalogQueryService } from "@/composition/catalog-query";
import type { ProductCardDto } from "@/queries/catalog-query-service";
import { findShopMemberRank } from "../member-rank";

export async function fetchMoreProducts(
  offset: number,
  params: { brand?: string; keyword?: string }
): Promise<ProductCardDto[]> {
  const { userId } = await requireAuth();
  if (!userId) return [];

  const rank = await findShopMemberRank(userId);

  const { products } = await catalogQueryService().findProducts({
    rank,
    offset,
    ...params,
  });
  return products;
}
