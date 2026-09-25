"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseFavoriteRepository } from "@/infrastructure/supabase/supabase-favorite-repository";
import { addFavorite } from "@/use-cases/add-favorite";
import { removeFavorite } from "@/use-cases/remove-favorite";

export async function addFavoriteAction(
  sanityProductId: string
): Promise<void> {
  const { userId } = await requireAuth();
  if (!userId) return;

  const supabase = createAdminClient();
  await addFavorite(
    { clerkUserId: userId, sanityProductId },
    {
      userRepo: new SupabaseUserRepository(supabase),
      favoriteRepo: new SupabaseFavoriteRepository(supabase),
    }
  );
  revalidatePath("/favorites");
}

export async function removeFavoriteAction(
  sanityProductId: string
): Promise<void> {
  const { userId } = await requireAuth();
  if (!userId) return;

  const supabase = createAdminClient();
  await removeFavorite(
    { clerkUserId: userId, sanityProductId },
    {
      userRepo: new SupabaseUserRepository(supabase),
      favoriteRepo: new SupabaseFavoriteRepository(supabase),
    }
  );
  revalidatePath("/favorites");
}
