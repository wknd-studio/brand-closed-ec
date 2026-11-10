import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { PortableText } from "@portabletext/react";
import { catalogQueryService } from "@/composition/catalog-query";
import { findShopMemberRank } from "@/app/(member)/shop/member-rank";
import { brandThemeQueryService } from "@/composition/brand-theme-query";
import BrandThemeWrapper from "@/components/brand-theme-wrapper";
import ImageGallery from "./image-gallery";
import AddToCartButton from "./add-to-cart-button";
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <BrandThemeWrapper theme={theme}>
        <Link
          href={`/shop/${encodeURIComponent(brand)}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          ← {brand} の商品一覧に戻る
        </Link>
        <div className="grid gap-10 md:grid-cols-2">
          <ImageGallery images={product.images} />

          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">{product.brand}</p>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-brand-primary">
                  {product.name}
                </h1>
                <FavoriteButton sanityProductId={id} className="shrink-0" />
              </div>
              {product.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {product.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1 rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-400">
                参考小売価格 ¥{product.retailPrice.toLocaleString()}
              </p>
              {product.isNegotiable ? (
                <p className="text-xl font-semibold text-gray-700">
                  価格要相談
                </p>
              ) : product.unitPrice != null ? (
                <p className="text-2xl font-bold">
                  ¥{product.unitPrice.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-gray-500">
                    （{rank.value} ランク価格）
                  </span>
                </p>
              ) : null}
            </div>

            <div>
              {isOutOfStock ? (
                <p className="text-sm font-medium text-red-500">在庫切れ</p>
              ) : (
                <p className="text-sm font-medium text-green-600">取り扱い中</p>
              )}
            </div>

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
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  添付ファイル
                </p>
                <ul className="space-y-1">
                  {product.files.map((file, i) => (
                    <li key={i}>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 underline underline-offset-2 hover:text-blue-800"
                      >
                        {file.label ?? `ファイル ${i + 1}`}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {product.description && product.description.length > 0 && (
          <div className="mt-10 border-t pt-8">
            <h2 className="mb-4 text-lg font-semibold">商品説明</h2>
            <div className="prose prose-sm max-w-none text-gray-700">
              <PortableText
                value={
                  product.description as Parameters<
                    typeof PortableText
                  >[0]["value"]
                }
              />
            </div>
          </div>
        )}
      </BrandThemeWrapper>
    </main>
  );
}
