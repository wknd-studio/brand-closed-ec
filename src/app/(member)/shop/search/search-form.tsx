export default function SearchForm({ defaultValue }: { defaultValue: string }) {
  return (
    <form action="/shop/search" method="get" className="flex gap-2">
      <input
        type="text"
        name="q"
        defaultValue={defaultValue}
        placeholder="商品名・ブランド名で検索"
        className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        検索
      </button>
    </form>
  );
}
