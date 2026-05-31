"use server";

import { auth } from "@clerk/nextjs/server";
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
  const { userId } = await auth();
  if (!userId) return [];

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("rank")
    .eq("clerk_user_id", userId)
    .single();

  const allowedRanks = getAllowedRanks(user?.rank ?? "free");
  const { products } = await fetchProducts({ allowedRanks, brand, offset });
  return products;
}
