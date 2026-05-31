export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 h-4 w-40 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-10 md:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-lg bg-gray-200" />
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="space-y-2 rounded-lg bg-gray-50 p-4">
            <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-11 w-full animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </main>
  );
}
