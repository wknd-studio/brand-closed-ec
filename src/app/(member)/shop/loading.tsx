import { Container } from "@/components/ui/container";

export default function Loading() {
  return (
    <main>
      <Container className="flex flex-col gap-5 pt-6 pb-14 md:gap-8 md:pt-12 md:pb-20">
        <div className="flex flex-col gap-3">
          <div className="h-3 w-28 animate-pulse rounded bg-neutral-200" />
          <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-neutral-200" />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="aspect-4/5 animate-pulse rounded-[10px] bg-neutral-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
              <div className="h-3 w-16 animate-pulse rounded bg-neutral-200" />
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
