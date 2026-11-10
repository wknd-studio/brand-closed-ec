import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseFavoriteRepository } from "@/infrastructure/supabase/supabase-favorite-repository";
import {
  addFavorite as addFavoriteUseCase,
  type AddFavoriteInput,
} from "@/use-cases/add-favorite";
import {
  removeFavorite as removeFavoriteUseCase,
  type RemoveFavoriteInput,
} from "@/use-cases/remove-favorite";

function favoriteDeps() {
  const supabase = createAdminClient();
  return {
    userRepo: new SupabaseUserRepository(supabase),
    favoriteRepo: new SupabaseFavoriteRepository(supabase),
  };
}

export function addFavorite(input: AddFavoriteInput) {
  return addFavoriteUseCase(input, favoriteDeps());
}

export function removeFavorite(input: RemoveFavoriteInput) {
  return removeFavoriteUseCase(input, favoriteDeps());
}
