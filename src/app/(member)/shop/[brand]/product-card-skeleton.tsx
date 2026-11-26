export default function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-4/5 animate-pulse rounded-md bg-neutral-100" />
      <div className="flex flex-col gap-2">
        <div className="h-4 w-full animate-pulse rounded bg-neutral-200" />
        <div className="h-4 w-20 animate-pulse rounded bg-neutral-200" />
        <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
      </div>
    </div>
  );
}
