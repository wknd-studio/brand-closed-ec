import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";

export default async function AdminOrdersPage() {
  const supabase = createAdminClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, users(first_name, last_name, email)")
    .eq("status", "confirming")
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">Invoice発行待ち注文</h1>

      {!orders || orders.length === 0 ? (
        <p className="text-sm text-gray-500">該当する注文はありません</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-3 pr-6 font-medium">注文番号</th>
              <th className="pb-3 pr-6 font-medium">会員名</th>
              <th className="pb-3 pr-6 font-medium">メールアドレス</th>
              <th className="pb-3 pr-6 font-medium">注文日時</th>
              <th className="pb-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((order) => {
              const user = Array.isArray(order.users)
                ? order.users[0]
                : order.users;
              return (
                <tr key={order.id} className="py-3">
                  <td className="py-3 pr-6 font-mono text-xs">
                    {order.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="py-3 pr-6">
                    {user ? `${user.last_name} ${user.first_name}` : "—"}
                  </td>
                  <td className="py-3 pr-6 text-gray-500">
                    {user?.email ?? "—"}
                  </td>
                  <td className="py-3 pr-6 text-gray-500">
                    {new Date(order.created_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      詳細・Invoice発行
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
