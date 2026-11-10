"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { catalogQueryService } from "@/composition/catalog-query";
import type { ProductCardDto } from "@/queries/catalog-query-service";
import { MemberRank } from "@/domain/value-objects/member-rank";

export async function fetchMoreProducts(
  offset: number,
  params: { brand?: string; keyword?: string }
): Promise<ProductCardDto[]> {
  const { userId } = await requireAuth();
  if (!userId) return [];

  const user = await new SupabaseUserRepository(
    await createServerClient()
  ).findByClerkUserId(userId);

  const { products } = await catalogQueryService().findProducts({
    rank: user?.rank ?? MemberRank.of("starter"),
    offset,
    ...params,
  });
  return products;
}
