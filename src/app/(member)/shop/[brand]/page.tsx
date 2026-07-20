import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { fetchProducts, getAllowedRanks } from "@/lib/sanity/products";
import ProductGrid from "./product-grid";

export default async function BrandProductsPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: encodedBrand } = await params;
  const brand = decodeURIComponent(encodedBrand);

  const { userId } = await auth();
  const supabase = await createServerClient();
  const userRepo = new SupabaseUserRepository(supabase);

  const user = await userRepo.findByClerkUserId(userId!);
  const userRank = user?.rank.value ?? "starter";
  const allowedRanks = getAllowedRanks(userRank);
  const { products, total } = await fetchProducts({ allowedRanks, brand });

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link
        href="/shop"
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        ← ブランド一覧に戻る
      </Link>
      <h1 className="mb-8 text-xl font-semibold">{brand}</h1>
      {products.length === 0 ? (
        <p className="text-center text-sm text-gray-400">
          表示できる商品がありません
        </p>
      ) : (
        <ProductGrid
          initialProducts={products}
          total={total}
          userRank={userRank}
          brand={brand}
        />
      )}
    </main>
  );
}
