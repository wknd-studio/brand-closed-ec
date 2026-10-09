import { isProductAccessible } from "@/lib/sanity/products";

export type FavoriteListItem<T> = {
  product: T;
  isAccessible: boolean;
};

/**
 * お気に入り商品IDの並び順（新しい順）を維持しつつ、Sanityから取得した商品データと結合する。
 * favoritesレコードは残っていてもSanity側で商品が削除済みの場合は一覧から除外する。
 */
export function buildFavoriteListItems<
  T extends { _id: string; min_rank: string },
>(
  favoriteSanityProductIds: string[],
  products: T[],
  userRank: string
): FavoriteListItem<T>[] {
  const productById = new Map(
    products.map((product) => [product._id, product])
  );

  return favoriteSanityProductIds
    .map((id) => productById.get(id))
    .filter((product): product is T => product !== undefined)
    .map((product) => ({
      product,
      isAccessible: isProductAccessible(userRank, product.min_rank),
    }));
}
