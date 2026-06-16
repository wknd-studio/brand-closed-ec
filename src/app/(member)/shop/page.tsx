import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { fetchBrands, getAllowedRanks } from "@/lib/sanity/products";

export default async function ShopPage() {
  const { userId } = await auth();
  const supabase = await createServerClient();
  const userRepo = new SupabaseUserRepository(supabase);

  const user = await userRepo.findByClerkUserId(userId!);
  const userRank = user?.rank.value ?? "free";
  const allowedRanks = getAllowedRanks(userRank);
  const brands = await fetchBrands(allowedRanks);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold">ブランドから探す</h1>
      {brands.length === 0 ? (
        <p className="text-center text-sm text-gray-400">
          表示できるブランドがありません
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {brands.map(({ brand, count, thumbnail }) => (
            <Link
              key={brand}
              href={`/shop/${encodeURIComponent(brand)}`}
              className="group overflow-hidden rounded-lg border bg-white transition hover:shadow-md"
            >
              <div className="relative aspect-video bg-gray-100">
                {thumbnail ? (
                  <Image
                    src={thumbnail}
                    alt={brand}
                    fill
                    className="object-cover transition group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-100" />
                )}
              </div>
              <div className="p-4">
                <p className="font-medium">{brand}</p>
                <p className="mt-0.5 text-sm text-gray-400">{count}点</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
