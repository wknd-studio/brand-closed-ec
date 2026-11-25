import { notFound } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import { requireAuth } from "@/lib/auth/current-user";
import { PortableText } from "@portabletext/react";
import { catalogQueryService } from "@/composition/catalog-query";
import { findShopMemberRank } from "@/app/(member)/shop/member-rank";
import { brandThemeQueryService } from "@/composition/brand-theme-query";
import { resolveBrandThemeCssVars } from "@/components/brand-theme-style";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import ImageGallery from "./image-gallery";
import AddToCartButton from "./add-to-cart-button";
import ProductTerms from "./product-terms";
import FavoriteButton from "@/components/favorite-button";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ brand: string; id: string }>;
}) {
  const { brand: encodedBrand, id } = await params;
  const brand = decodeURIComponent(encodedBrand);
  const { userId } = await requireAuth();

  const rank = await findShopMemberRank(userId!);
  const [product, theme] = await Promise.all([
    catalogQueryService().findProductDetail({ rank, productId: id }),
    brandThemeQueryService().findBrandTheme(brand),
  ]);

  if (!product) notFound();

  const isOutOfStock = product.availability === "out_of_stock";
  const brandHref = `/shop/${encodeURIComponent(brand)}`;

  return (
    <main
      style={resolveBrandThemeCssVars(theme) as CSSProperties}
      className="pt-4 pb-14 sm:pt-7 sm:pb-20"
    >
      <Container className="flex flex-col gap-5 sm:gap-7">
        <Breadcrumb
          items={[
            { label: "ショップ", href: "/shop" },
            { label: product.brand, href: brandHref },
            { label: product.name },
          ]}
        />

        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-12">
          <ImageGallery images={product.images} productName={product.name} />

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              {/* ブランド名だけをブランドのテーマの色・フォントで出す */}
              <Link
                href={brandHref}
                className="self-start font-brand text-lg font-semibold text-brand-primary hover:underline"
              >
                {product.brand}
              </Link>
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-[1.375rem] leading-snug font-semibold text-neutral-900 sm:text-[1.75rem]">
                  {product.name}
                </h1>
                <FavoriteButton sanityProductId={id} className="shrink-0" />
              </div>
              {product.categories.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {product.categories.map((c) => (
                    <li key={c}>
                      <Badge>{c}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 割引率は出さない（二重価格表示のおそれ） */}
            <div className="flex flex-col gap-1 rounded-2xl border border-neutral-200 bg-white px-5 py-4.5">
              {product.isNegotiable ? (
                <p className="text-xl font-semibold text-neutral-900">
                  価格要相談
                </p>
              ) : product.unitPrice != null ? (
                <>
                  <p className="text-xs text-neutral-700">
                    <span className="font-semibold text-primary-strong uppercase">
                      {rank.value}
                    </span>{" "}
                    の会員価格
                  </p>
                  <p className="text-[2rem] leading-tight font-bold text-neutral-900 tabular-nums">
                    <span className="text-lg font-medium">¥</span>
                    {product.unitPrice.toLocaleString()}
                  </p>
                </>
              ) : null}
              <p className="text-xs text-secondary tabular-nums">
                参考小売価格 ¥{product.retailPrice.toLocaleString()}
              </p>
            </div>

            <ProductTerms
              availability={product.availability}
              paymentTiming={product.paymentTiming}
              isNegotiable={product.isNegotiable}
            />

            <AddToCartButton
              item={{
                productId: id,
                productName: product.name,
                thumbnail: product.images[0] ?? null,
                unitPrice: product.unitPrice,
                availability: product.availability,
                paymentTiming: product.paymentTiming,
              }}
              isOutOfStock={isOutOfStock}
            />

            {product.files.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[0.8125rem] font-semibold text-neutral-700">
                  添付ファイル
                </p>
                <ul className="flex flex-col gap-2">
                  {product.files.map((file, i) => (
                    <li key={i}>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm text-neutral-900 transition-colors hover:border-primary"
                      >
                        <FileIcon />
                        {file.label ?? `ファイル ${i + 1}`}
                        <span className="ml-auto text-xs text-secondary">
                          別のタブで開く
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {product.description && product.description.length > 0 && (
          <section
            aria-labelledby="product-description"
            className="flex max-w-[760px] flex-col gap-3 border-t border-neutral-200 pt-7"
          >
            <h2
              id="product-description"
              className="font-display text-xl font-semibold"
            >
              商品説明
            </h2>
            <div className="flex flex-col gap-3 text-[0.9375rem] leading-[1.9] text-neutral-800">
              <PortableText
                value={
                  product.description as Parameters<
                    typeof PortableText
                  >[0]["value"]
                }
              />
            </div>
          </section>
        )}
      </Container>
    </main>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4.5 shrink-0 text-primary-strong"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
