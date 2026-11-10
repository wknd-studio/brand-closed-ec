import { requireAuth } from "@/lib/auth/current-user";
import { catalogQueryService } from "@/composition/catalog-query";
import { findShopMemberRank } from "../member-rank";
import ProductGrid from "../[brand]/product-grid";
import SearchForm from "./search-form";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const keyword = q?.trim() ?? "";

  const { userId } = await requireAuth();
  const rank = await findShopMemberRank(userId!);

  const { products, total } = keyword
    ? await catalogQueryService().findProducts({ rank, keyword })
    : { products: [], total: 0 };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold">商品検索</h1>
      <SearchForm defaultValue={keyword} />
      {keyword && products.length === 0 && (
        <p className="mt-8 text-center text-sm text-gray-400">
          「{keyword}」に一致する商品がありません
        </p>
      )}
      {products.length > 0 && (
        <div className="mt-8">
          <ProductGrid
            key={keyword}
            initialProducts={products}
            total={total}
            keyword={keyword}
          />
        </div>
      )}
    </main>
  );
}
