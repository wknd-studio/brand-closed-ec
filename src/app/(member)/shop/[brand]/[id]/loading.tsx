import { Container } from "@/components/ui/container";

export default function Loading() {
  return (
    <main className="pt-4 pb-14 sm:pt-7 sm:pb-20">
      <Container className="flex flex-col gap-5 sm:gap-7">
        <div className="h-4 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-12">
          <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-neutral-200" />
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="h-5 w-24 animate-pulse rounded bg-neutral-200" />
              <div className="h-8 w-3/4 animate-pulse rounded bg-neutral-200" />
            </div>
            <div className="h-28 w-full animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-32 w-full animate-pulse rounded bg-neutral-100" />
            <div className="h-13 w-full animate-pulse rounded-full bg-neutral-200" />
          </div>
        </div>
      </Container>
    </main>
  );
}
