import Image from "next/image";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { catalogQueryService } from "@/composition/catalog-query";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { findShopMemberRank } from "./member-rank";
import { pricePlanLabel } from "./price-plan";
import SearchForm from "./search-form";

export default async function ShopPage() {
  const { userId } = await requireAuth();
  const rank = await findShopMemberRank(userId!);
  const brands = await catalogQueryService().findBrands(rank);

  return (
    <main>
      <Container className="flex flex-col gap-5 pt-6 pb-14 md:gap-8 md:pt-12 md:pb-20">
        <div className="flex flex-col gap-2.5">
          <Eyebrow withLine>MEMBERS SHOP</Eyebrow>
          <Heading as="h1" level="compact">
            ブランドから探す
          </Heading>
          <p className="text-sm leading-[1.8] text-neutral-700">
            表示している価格は、
            <span className="font-semibold text-primary-strong">
              {pricePlanLabel(rank)}プラン
            </span>
            の会員価格です。
          </p>
        </div>

        <SearchForm className="md:hidden" />

        {brands.length === 0 ? (
          <p className="py-10 text-center text-sm text-secondary">
            表示できるブランドがありません
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
            {brands.map(({ brand, count, thumbnail, category }) => (
              <Link
                key={brand}
                href={`/shop/${encodeURIComponent(brand)}`}
                className="group flex flex-col gap-3 text-neutral-900"
              >
                <span className="relative flex aspect-4/5 items-center justify-center overflow-hidden rounded-[10px] bg-neutral-100 p-4">
                  {thumbnail ? (
                    <Image
                      src={thumbnail}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <span className="text-center font-display text-xl tracking-[0.04em] text-neutral-700 md:text-[1.625rem]">
                      {brand}
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[0.9375rem] font-semibold group-hover:underline">
                    {brand}
                  </span>
                  <span className="text-xs text-neutral-700">
                    {category && (
                      <>
                        {category}
                        <span className="text-neutral-500"> ・ </span>
                      </>
                    )}
                    {count}点
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
