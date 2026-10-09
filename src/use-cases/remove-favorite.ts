import type { UserRepository } from "@/repositories/user-repository";
import type { FavoriteRepository } from "@/repositories/favorite-repository";

export type RemoveFavoriteInput = {
  clerkUserId: string;
  sanityProductId: string;
};

export type RemoveFavoriteDeps = {
  userRepo: UserRepository;
  favoriteRepo: FavoriteRepository;
};

export async function removeFavorite(
  input: RemoveFavoriteInput,
  deps: RemoveFavoriteDeps
): Promise<void> {
  const { userRepo, favoriteRepo } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  await favoriteRepo.remove(user.id, input.sanityProductId);
}
