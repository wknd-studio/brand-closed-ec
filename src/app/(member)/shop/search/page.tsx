import { requireAuth } from "@/lib/auth/current-user";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { fetchProducts, getAllowedRanks } from "@/lib/sanity/products";
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
  const supabase = await createServerClient();
  const userRepo = new SupabaseUserRepository(supabase);

  const user = await userRepo.findByClerkUserId(userId!);
  const userRank = user?.rank.value ?? "starter";
  const allowedRanks = getAllowedRanks(userRank);

  const { products, total } = keyword
    ? await fetchProducts({ allowedRanks, keyword })
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
            userRank={userRank}
            keyword={keyword}
          />
        </div>
      )}
    </main>
  );
}
