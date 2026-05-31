import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { fetchProducts, getAllowedRanks } from "@/lib/sanity/products";
import ProductGrid from "./product-grid";

export default async function ShopPage() {
  const { userId } = await auth();

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("rank")
    .eq("clerk_user_id", userId!)
    .single();

  const userRank = user?.rank ?? "free";
  const allowedRanks = getAllowedRanks(userRank);
  const { products, total } = await fetchProducts({ allowedRanks });

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold">商品一覧</h1>
      {products.length === 0 ? (
        <p className="text-center text-sm text-gray-400">
          表示できる商品がありません
        </p>
      ) : (
        <ProductGrid
          initialProducts={products}
          total={total}
          userRank={userRank}
        />
      )}
    </main>
  );
}
