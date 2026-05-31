import Image from "next/image";
import type { MemberRank, Product } from "@/lib/sanity/products";

export default function ProductCard({
  product,
  userRank,
}: {
  product: Product;
  userRank: string;
}) {
  const rankPrice = product.is_negotiable
    ? null
    : (product.prices?.[userRank as MemberRank] ?? null);

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="relative aspect-square bg-gray-100">
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
        {product.availability === "out_of_stock" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded bg-white px-2 py-1 text-xs font-medium text-gray-700">
              在庫切れ
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1 p-3">
        <p className="text-xs text-gray-500">{product.brand}</p>
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        <p className="text-xs text-gray-400">
          参考小売価格 ¥{product.retail_price.toLocaleString()}
        </p>
        {product.is_negotiable ? (
          <p className="text-sm font-semibold text-gray-600">価格要相談</p>
        ) : rankPrice != null ? (
          <p className="text-sm font-semibold">¥{rankPrice.toLocaleString()}</p>
        ) : null}
      </div>
    </div>
  );
}
