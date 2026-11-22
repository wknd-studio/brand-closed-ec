import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { memberOrderQueryService } from "@/composition/member-order-query";

const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

// URL の page が数字でない・1未満なら1ページ目にする
function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export default async function OrdersPage({ searchParams }: Props) {
  const { userId } = await requireAuth();
  const page = parsePage((await searchParams).page);
  const history = await (
    await memberOrderQueryService()
  ).findOrderHistory({ clerkUserId: userId!, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(history.totalCount / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-8 text-xl font-semibold">注文履歴</h1>
      {history.orders.length === 0 ? (
        <p className="text-center text-sm text-gray-400">
          {history.totalCount === 0 ? (
            "注文はまだありません"
          ) : (
            <Link href="/orders" className="underline">
              1ページ目に戻る
            </Link>
          )}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-6 font-medium">注文日</th>
              <th className="pb-3 pr-6 font-medium">注文番号</th>
              <th className="pb-3 pr-6 font-medium">ステータス</th>
              <th className="pb-3 pr-6 text-right font-medium">合計金額</th>
              <th className="pb-3 text-right font-medium">商品点数</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {history.orders.map((order) => (
              <tr key={order.orderId}>
                <td className="py-3 pr-6 text-gray-500">
                  {new Date(order.createdAt).toLocaleDateString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </td>
                <td className="py-3 pr-6 font-mono text-xs">
                  {order.orderId.slice(0, 8).toUpperCase()}
                </td>
                <td className="py-3 pr-6">{order.status.label()}</td>
                <td className="py-3 pr-6 text-right">
                  ¥{order.fixedTotal.toLocaleString()}
                  {order.includesNegotiable && (
                    <span className="block text-xs text-gray-400">
                      ＋価格未確定の商品を含む
                    </span>
                  )}
                </td>
                <td className="py-3 text-right">{order.itemCount}点</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {history.totalCount > PAGE_SIZE && (
        <nav
          aria-label="ページ送り"
          className="mt-8 flex items-center justify-center gap-6 text-sm"
        >
          {page > 1 ? (
            <Link href={`/orders?page=${page - 1}`} className="underline">
              新しい注文
            </Link>
          ) : (
            <span className="text-gray-300">新しい注文</span>
          )}
          <span className="text-gray-500">
            {page} / {totalPages} ページ
          </span>
          {page < totalPages ? (
            <Link href={`/orders?page=${page + 1}`} className="underline">
              古い注文
            </Link>
          ) : (
            <span className="text-gray-300">古い注文</span>
          )}
        </nav>
      )}
    </main>
  );
}
