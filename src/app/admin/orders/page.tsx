import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";

const STATUS_LABEL: Record<string, string> = {
  confirming: "注文確認中",
  limit_exceeded: "上限超過・発行停止",
  invoice_sent: "請求書送付済み",
  paid: "入金確認済み",
  sourcing: "手配中",
  ordered: "発注完了",
  preparing: "発送準備中",
  shipping: "配送中",
};

const STATUS_COLOR: Record<string, string> = {
  confirming: "bg-amber-100 text-amber-700",
  limit_exceeded: "bg-red-100 text-red-700",
  invoice_sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  sourcing: "bg-purple-100 text-purple-700",
  ordered: "bg-purple-100 text-purple-700",
  preparing: "bg-orange-100 text-orange-700",
  shipping: "bg-indigo-100 text-indigo-700",
};

export default async function AdminOrdersPage() {
  const supabase = createAdminClient();
  const orderRepo = new SupabaseOrderRepository(supabase);
  const orders = await orderRepo.findActiveOrdersWithUser();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">注文管理</h1>

      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">対応中の注文はありません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-6 font-medium">注文番号</th>
              <th className="pb-3 pr-6 font-medium">会員名</th>
              <th className="pb-3 pr-6 font-medium">ステータス</th>
              <th className="pb-3 pr-6 font-medium">注文日時</th>
              <th className="pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="py-3 pr-6 font-mono text-xs">
                  {order.id.slice(0, 8).toUpperCase()}
                </td>
                <td className="py-3 pr-6">
                  {order.user
                    ? `${order.user.lastName} ${order.user.firstName}`
                    : "—"}
                </td>
                <td className="py-3 pr-6">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </td>
                <td className="py-3 pr-6 text-gray-500">
                  {order.createdAt.toLocaleString("ja-JP")}
                </td>
                <td className="py-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
