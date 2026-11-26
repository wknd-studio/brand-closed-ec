"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMoreProducts } from "./actions";
import ProductCard from "./product-card";
import ProductCardSkeleton from "./product-card-skeleton";
import type { ProductCardDto } from "@/queries/catalog-query-service";

export default function ProductGrid({
  initialProducts,
  total,
  brand,
  keyword,
}: {
  initialProducts: ProductCardDto[];
  total: number;
  brand?: string;
  keyword?: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [isLoading, setIsLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = products.length < total;

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const next = await fetchMoreProducts(products.length, { brand, keyword });
    setProducts((prev) => [...prev, ...next]);
    setIsLoading(false);
  }, [isLoading, hasMore, products.length, brand, keyword]);

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
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-3 md:gap-x-6 md:gap-y-12 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <li key={`skeleton-${i}`} aria-hidden="true">
              <ProductCardSkeleton />
            </li>
          ))}
      </ul>

      <div ref={sentinelRef} className="h-px" />

      <p
        role="status"
        className="flex items-center justify-center gap-2.5 text-center text-[0.8125rem] text-neutral-600"
      >
        <span
          aria-hidden="true"
          className="h-px w-6 shrink-0 bg-neutral-300 md:w-10"
        />
        {hasMore
          ? `${products.length}点を表示中・下へスクロールすると続きを読み込みます`
          : "すべての商品を表示しました"}
        <span
          aria-hidden="true"
          className="h-px w-6 shrink-0 bg-neutral-300 md:w-10"
        />
      </p>
    </div>
  );
}
