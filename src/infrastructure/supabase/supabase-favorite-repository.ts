import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { FavoriteRepository } from "@/repositories/favorite-repository";

export class SupabaseFavoriteRepository implements FavoriteRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findSanityProductIdsByUserId(userId: string): Promise<string[]> {
    const { data } = await this.db
      .from("favorites")
      .select("sanity_product_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((row) => row.sanity_product_id);
  }

  async add(userId: string, sanityProductId: string): Promise<void> {
    await this.db
      .from("favorites")
      .upsert(
        { user_id: userId, sanity_product_id: sanityProductId },
        { onConflict: "user_id,sanity_product_id", ignoreDuplicates: true }
      );
  }

  async remove(userId: string, sanityProductId: string): Promise<void> {
    await this.db
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("sanity_product_id", sanityProductId);
  }
}
