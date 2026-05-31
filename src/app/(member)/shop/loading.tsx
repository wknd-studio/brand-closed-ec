import ProductCardSkeleton from "./product-card-skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 h-7 w-20 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
