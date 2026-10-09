import { requireAuth } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseFavoriteRepository } from "@/infrastructure/supabase/supabase-favorite-repository";
import { fetchProductsByIds } from "@/lib/sanity/products";
import { buildFavoriteListItems } from "@/lib/favorites/build-list";
import FavoriteListCard from "./favorite-list-card";

export default async function FavoritesPage() {
  const { userId } = await requireAuth();
  const supabase = createAdminClient();
  const userRepo = new SupabaseUserRepository(supabase);

  const user = await userRepo.findByClerkUserId(userId!);
  const userRank = user?.rank.value ?? "starter";

  const favoriteSanityProductIds = user
    ? await new SupabaseFavoriteRepository(
        supabase
      ).findSanityProductIdsByUserId(user.id)
    : [];
  const products = await fetchProductsByIds(favoriteSanityProductIds);
  const items = buildFavoriteListItems(
    favoriteSanityProductIds,
    products,
    userRank
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold">お気に入り</h1>
      {items.length === 0 ? (
        <p className="text-center text-sm text-gray-400">
          お気に入りに登録した商品はありません
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map(({ product, isAccessible }) => (
            <FavoriteListCard
              key={product._id}
              product={product}
              isAccessible={isAccessible}
              userRank={userRank}
            />
          ))}
        </div>
      )}
    </main>
  );
}
