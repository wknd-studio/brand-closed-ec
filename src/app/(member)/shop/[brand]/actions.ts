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
  brand: string
): Promise<Product[]> {
  const { userId } = await requireAuth();
  if (!userId) return [];

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("rank")
    .eq("clerk_user_id", userId)
    .single();

  const allowedRanks = getAllowedRanks(user?.rank ?? "starter");
  const { products } = await fetchProducts({ allowedRanks, brand, offset });
  return products;
}
