"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMoreProducts } from "./actions";
import ProductCard from "./product-card";
import ProductCardSkeleton from "./product-card-skeleton";
import type { Product } from "@/lib/sanity/products";

export default function ProductGrid({
  initialProducts,
  total,
  userRank,
}: {
  initialProducts: Product[];
  total: number;
  userRank: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [isLoading, setIsLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = products.length < total;

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const next = await fetchMoreProducts(products.length);
    setProducts((prev) => [...prev, ...next]);
    setIsLoading(false);
  }, [isLoading, hasMore, products.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product._id}
            product={product}
            userRank={userRank}
          />
        ))}
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={`skeleton-${i}`} />
          ))}
      </div>

      <div ref={sentinelRef} className="h-4" />

      {!hasMore && products.length > 0 && (
        <p className="mt-8 text-center text-sm text-gray-400">
          すべての商品を表示しました
        </p>
      )}
    </div>
  );
}
