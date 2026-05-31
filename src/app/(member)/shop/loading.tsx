export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 h-7 w-36 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border bg-white">
            <div className="aspect-video animate-pulse bg-gray-200" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-10 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
