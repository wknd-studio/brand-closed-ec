import Image from "next/image";
import Link from "next/link";
import type { MemberRank, Product } from "@/lib/sanity/products";
import FavoriteButton from "@/components/favorite-button";

export default function FavoriteListCard({
  product,
  isAccessible,
  userRank,
}: {
  product: Product;
  isAccessible: boolean;
  userRank: string;
}) {
  const rankPrice = product.is_negotiable
    ? null
    : (product.prices?.[userRank as MemberRank] ?? null);

  const body = (
    <>
      <div className="relative aspect-square bg-gray-100">
        <FavoriteButton
          sanityProductId={product._id}
          className="absolute right-2 top-2 z-10"
        />
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="h-full w-full bg-gray-100" />
        )}
        {!isAccessible && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50">
            <span aria-hidden="true" className="text-xl text-white">
              🔒
            </span>
            <span className="rounded bg-white px-2 py-1 text-xs font-medium text-gray-700">
              現在のランクでは閲覧できません
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1 p-3">
        <p className="text-xs text-gray-500">{product.brand}</p>
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        {isAccessible &&
          (product.is_negotiable ? (
            <p className="text-sm font-semibold text-gray-600">価格要相談</p>
          ) : rankPrice != null ? (
            <p className="text-sm font-semibold">
              ¥{rankPrice.toLocaleString()}
            </p>
          ) : null)}
      </div>
    </>
  );

  if (!isAccessible) {
    return (
      <div className="overflow-hidden rounded-lg border bg-white">{body}</div>
    );
  }

  return (
    <Link
      href={`/shop/${encodeURIComponent(product.brand)}/${product._id}`}
      className="block overflow-hidden rounded-lg border bg-white transition hover:shadow-md"
    >
      {body}
    </Link>
  );
}
