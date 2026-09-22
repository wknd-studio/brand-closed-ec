"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server-admin";
import {
  fetchProducts,
  getAllowedRanks,
  type Product,
} from "@/lib/sanity/products";

export async function fetchMoreProducts(
  offset: number,
  params: { brand?: string; keyword?: string }
): Promise<Product[]> {
  const { userId } = await requireAuth();
  if (!userId) return [];

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("rank_code")
    .eq("clerk_user_id", userId)
    .single();

  const allowedRanks = getAllowedRanks(user?.rank_code ?? "starter");
  const { products } = await fetchProducts({ allowedRanks, offset, ...params });
  return products;
}
