import { Container } from "@/components/ui/container";
import ProductCardSkeleton from "./product-card-skeleton";

export default function Loading() {
  return (
    <main>
      <Container className="flex flex-col gap-[18px] pt-4 pb-14 md:gap-6 md:pt-7 md:pb-20">
        <div className="h-4 w-32 animate-pulse rounded bg-neutral-200" />
        <div className="min-h-[170px] animate-pulse rounded-3xl bg-neutral-100 md:min-h-[260px]" />
        <div className="h-5 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-7 md:grid-cols-3 md:gap-x-6 md:gap-y-12 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </Container>
    </main>
  );
}
