import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { catalogQueryService } from "@/composition/catalog-query";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { fetchBrandTheme } from "@/lib/sanity/brand-theme";
import BrandThemeWrapper from "@/components/brand-theme-wrapper";
import ProductGrid from "./product-grid";

export default async function BrandProductsPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: encodedBrand } = await params;
  const brand = decodeURIComponent(encodedBrand);

  const { userId } = await requireAuth();
  const supabase = await createServerClient();
  const userRepo = new SupabaseUserRepository(supabase);

  const user = await userRepo.findByClerkUserId(userId!);
  const rank = user?.rank ?? MemberRank.of("starter");
  const [{ products, total }, theme] = await Promise.all([
    catalogQueryService().findProducts({ rank, brand }),
    fetchBrandTheme(brand),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <BrandThemeWrapper theme={theme}>
        <Link
          href="/shop"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          ← ブランド一覧に戻る
        </Link>
        <h1 className="mb-8 text-xl font-semibold text-brand-primary">
          {brand}
        </h1>
        {products.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            表示できる商品がありません
          </p>
        ) : (
          <ProductGrid initialProducts={products} total={total} brand={brand} />
        )}
      </BrandThemeWrapper>
    </main>
  );
}
