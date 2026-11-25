import Image from "next/image";
import type { CSSProperties } from "react";
import { requireAuth } from "@/lib/auth/current-user";
import { catalogQueryService } from "@/composition/catalog-query";
import { findShopMemberRank } from "@/app/(member)/shop/member-rank";
import { pricePlanLabel } from "@/app/(member)/shop/price-plan";
import { brandThemeQueryService } from "@/composition/brand-theme-query";
import { resolveBrandThemeCssVars } from "@/components/brand-theme-style";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import ProductGrid from "./product-grid";

export default async function BrandProductsPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: encodedBrand } = await params;
  const brand = decodeURIComponent(encodedBrand);

  const { userId } = await requireAuth();
  const rank = await findShopMemberRank(userId!);
  const [{ products, total }, theme] = await Promise.all([
    catalogQueryService().findProducts({ rank, brand }),
    brandThemeQueryService().findBrandTheme(brand),
  ]);

  return (
    <main>
      <Container className="flex flex-col gap-[18px] pt-4 pb-14 md:gap-6 md:pt-7 md:pb-20">
        <Breadcrumb
          items={[{ label: "ショップ", href: "/shop" }, { label: brand }]}
        />

        {/* バナーと見出しにだけブランドのテーマ（色・フォント・バナー画像）を使う。テーマが無いブランドは EQ×Mart の色 */}
        <section
          data-brand-banner
          aria-label={`${brand} について`}
          style={resolveBrandThemeCssVars(theme) as CSSProperties}
          className={cn(
            "relative isolate flex min-h-[170px] flex-col justify-end gap-1.5 overflow-hidden rounded-3xl p-5 md:min-h-[260px] md:px-10 md:py-9",
            theme
              ? "bg-brand-primary text-white"
              : "bg-linear-160 from-primary-light to-primary text-primary-foreground"
          )}
        >
          {theme?.bannerUrl && (
            <>
              <Image
                src={theme.bannerUrl}
                alt=""
                fill
                priority
                className="-z-10 object-cover"
                sizes="(max-width: 1080px) 100vw, 1080px"
              />
              {/* バナー画像の上でも見出しを読めるよう、下側を暗くする */}
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-linear-to-t from-neutral-900/60 to-transparent"
              />
            </>
          )}
          <h1
            className={cn(
              "text-4xl leading-[1.1] font-semibold md:text-[3.5rem]",
              theme ? "font-brand" : "font-display"
            )}
          >
            {brand}
          </h1>
          <span className="text-[0.8125rem] opacity-90">{total}点の商品</span>
        </section>

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900">
            すべての商品{" "}
            <span className="text-[0.8125rem] font-normal text-neutral-600">
              {total}点
            </span>
          </h2>
          <span className="text-xs text-neutral-700">
            価格は{" "}
            <span className="font-semibold text-primary-strong">
              {pricePlanLabel(rank)}
            </span>
            プランの会員価格です
          </span>
        </div>

        {products.length === 0 ? (
          <p className="py-10 text-center text-sm text-secondary">
            表示できる商品がありません
          </p>
        ) : (
          <ProductGrid initialProducts={products} total={total} brand={brand} />
        )}
      </Container>
    </main>
  );
}
