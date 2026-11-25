import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { catalogQueryService } from "@/composition/catalog-query";
import { findShopMemberRank } from "@/app/(member)/shop/member-rank";
import ProductGrid from "@/app/(member)/shop/[brand]/product-grid";
import SearchForm from "@/app/(member)/shop/search-form";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";

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
    <main>
      <Container className="flex flex-col gap-[18px] pt-6 pb-14 md:gap-6 md:pt-12 md:pb-20">
        <div className="flex flex-col gap-2.5">
          <Eyebrow withLine>SEARCH</Eyebrow>
          <Heading as="h1" level="compact">
            商品を検索
          </Heading>
        </div>
        <SearchForm defaultValue={keyword} withButton />

        {keyword && products.length > 0 && (
          <>
            <p role="status" className="text-sm text-neutral-700">
              「
              <span className="font-semibold text-neutral-900">{keyword}</span>
              」の検索結果{" "}
              <span className="font-semibold text-neutral-900">{total}件</span>
            </p>
            <ProductGrid
              key={keyword}
              initialProducts={products}
              total={total}
              keyword={keyword}
            />
          </>
        )}

        {keyword && products.length === 0 && (
          <div
            role="status"
            className="flex flex-col items-center gap-3 rounded-3xl border border-neutral-200 bg-white px-6 py-10 text-center"
          >
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </span>
            <p className="text-base font-semibold text-neutral-900">
              「{keyword}」に一致する商品はありません
            </p>
            <p className="text-sm text-neutral-700">
              別のキーワードで探すか、ブランドの一覧からお探しください。
            </p>
            <Link
              href="/shop"
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
                className: "mt-1",
              })}
            >
              ブランドから探す
            </Link>
          </div>
        )}
      </Container>
    </main>
  );
}
