import Image from "next/image";
import Link from "next/link";
import type { ProductCardDto } from "@/queries/catalog-query-service";
import FavoriteButton from "@/components/favorite-button";

export default function ProductCard({ product }: { product: ProductCardDto }) {
  return (
    <Link
      href={`/shop/${encodeURIComponent(product.brand)}/${product.id}`}
      className="block overflow-hidden rounded-lg border bg-white transition hover:shadow-md"
    >
      <div className="relative aspect-square bg-gray-100">
        <FavoriteButton
          sanityProductId={product.id}
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
          参考小売価格 ¥{product.retailPrice.toLocaleString()}
        </p>
        {product.isNegotiable ? (
          <p className="text-sm font-semibold text-gray-600">価格要相談</p>
        ) : product.unitPrice != null ? (
          <p className="text-sm font-semibold">
            ¥{product.unitPrice.toLocaleString()}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
