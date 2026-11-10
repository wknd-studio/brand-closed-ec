"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/current-user";
import { addFavorite, removeFavorite } from "@/composition/favorite";

export async function addFavoriteAction(
  sanityProductId: string
): Promise<void> {
  const { userId } = await requireAuth();
  if (!userId) return;

  await addFavorite({ clerkUserId: userId, sanityProductId });
  revalidatePath("/favorites");
}

export async function removeFavoriteAction(
  sanityProductId: string
): Promise<void> {
  const { userId } = await requireAuth();
  if (!userId) return;

  await removeFavorite({ clerkUserId: userId, sanityProductId });
  revalidatePath("/favorites");
}
