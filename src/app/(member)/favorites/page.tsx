import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { memberQueryService } from "@/composition/member-query";
import { catalogQueryService } from "@/composition/catalog-query";
import { MemberRank } from "@/domain/value-objects/member-rank";
import FavoriteButton from "@/components/favorite-button";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { ProductCard } from "@/components/ui/product-card";

export default async function FavoritesPage() {
  const { userId } = await requireAuth();
  const favorites = await (await memberQueryService()).findFavorites(userId!);
  const items = await catalogQueryService().findFavoriteProducts({
    rank: favorites?.rank ?? MemberRank.of("starter"),
    productIds: favorites?.favoriteProductIds ?? [],
  });

  return (
    <main>
      <Container className="flex flex-col gap-5 pt-6 pb-14 md:gap-7 md:pt-12 md:pb-20">
        <div className="flex flex-col gap-2.5">
          <Eyebrow withLine>MY PAGE</Eyebrow>
          <Heading as="h1" level="compact">
            お気に入り
          </Heading>
          {items.length > 0 && (
            <p className="text-sm text-neutral-700">{items.length}点の商品</p>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-neutral-200 bg-white px-6 py-12 text-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
              </svg>
            </span>
            <p className="text-base font-semibold text-neutral-900">
              お気に入りに登録した商品はありません
            </p>
            <p className="text-[0.8125rem] text-neutral-700">
              商品のハートを押すと、ここに集まります。
            </p>
            <Link
              href="/shop"
              className={buttonVariants({ className: "mt-1" })}
            >
              ショップを見る
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-3 md:gap-x-6 md:gap-y-12 lg:grid-cols-4">
            {items.map(({ product, isAccessible }) => (
              <li key={product.id}>
                <ProductCard
                  href={`/shop/${encodeURIComponent(product.brand)}/${product.id}`}
                  name={product.name}
                  brand={product.brand}
                  imageUrl={product.thumbnail}
                  retailPrice={product.retailPrice}
                  unitPrice={product.unitPrice}
                  isNegotiable={product.isNegotiable}
                  isOutOfStock={product.availability === "out_of_stock"}
                  isInvoicePayment={product.paymentTiming === "after_order"}
                  isLocked={!isAccessible}
                  favorite={<FavoriteButton sanityProductId={product.id} />}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
