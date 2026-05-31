export default function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="aspect-square animate-pulse bg-gray-200" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  );
}
