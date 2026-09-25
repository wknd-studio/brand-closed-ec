import type { UserRepository } from "@/repositories/user-repository";
import type { FavoriteRepository } from "@/repositories/favorite-repository";

export type AddFavoriteInput = {
  clerkUserId: string;
  sanityProductId: string;
};

export type AddFavoriteDeps = {
  userRepo: UserRepository;
  favoriteRepo: FavoriteRepository;
};

export async function addFavorite(
  input: AddFavoriteInput,
  deps: AddFavoriteDeps
): Promise<void> {
  const { userRepo, favoriteRepo } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  await favoriteRepo.add(user.id, input.sanityProductId);
}
