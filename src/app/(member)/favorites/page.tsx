import { requireAuth } from "@/lib/auth/current-user";
import { memberQueryService } from "@/composition/member-query";
import { catalogQueryService } from "@/composition/catalog-query";
import { MemberRank } from "@/domain/value-objects/member-rank";
import FavoriteListCard from "./favorite-list-card";

export default async function FavoritesPage() {
  const { userId } = await requireAuth();
  const favorites = await (await memberQueryService()).findFavorites(userId!);
  const items = await catalogQueryService().findFavoriteProducts({
    rank: favorites?.rank ?? MemberRank.of("starter"),
    productIds: favorites?.favoriteProductIds ?? [],
  });

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
              key={product.id}
              product={product}
              isAccessible={isAccessible}
            />
          ))}
        </div>
      )}
    </main>
  );
}
