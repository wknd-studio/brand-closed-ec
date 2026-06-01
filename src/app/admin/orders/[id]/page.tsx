import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import InvoiceForm from "./invoice-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: order }, { data: items }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, created_at, status, users(first_name, last_name, email, stripe_customer_id)"
      )
      .eq("id", id)
      .eq("status", "confirming")
      .single(),
    supabase
      .from("order_items")
      .select(
        "id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable"
      )
      .eq("order_id", id),
  ]);

  if (!order) notFound();

  const user = Array.isArray(order.users) ? order.users[0] : order.users;

  const fixedItems = (items ?? []).filter((i) => !i.is_negotiable);
  const negotiableItems = (items ?? []).filter((i) => i.is_negotiable);
  const fixedTotal = fixedItems.reduce(
    (sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity,
    0
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/orders"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 一覧へ戻る
        </Link>
        <h1 className="text-xl font-semibold">
          注文 {order.id.slice(0, 8).toUpperCase()}
        </h1>
      </div>

      <div className="space-y-6">
        {/* 会員情報 */}
        <section className="rounded-lg border p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">会員情報</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">氏名</dt>
              <dd>{user ? `${user.last_name} ${user.first_name}` : "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">メール</dt>
              <dd>{user?.email ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">注文日時</dt>
              <dd>{new Date(order.created_at).toLocaleString("ja-JP")}</dd>
            </div>
          </dl>
        </section>

        {/* 固定価格商品 */}
        {fixedItems.length > 0 && (
          <section className="rounded-lg border p-5">
            <h2 className="mb-3 text-sm font-medium text-gray-700">
              固定価格商品
            </h2>
            <ul className="divide-y">
              {fixedItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.product_name_snapshot}</p>
                    <p className="text-xs text-gray-500">× {item.quantity}</p>
                  </div>
                  <p className="tabular-nums">
                    ¥
                    {(
                      (item.unit_price_snapshot ?? 0) * item.quantity
                    ).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t pt-3 text-sm font-medium">
              <span>固定価格小計</span>
              <span className="tabular-nums">
                ¥{fixedTotal.toLocaleString()}
              </span>
            </div>
          </section>
        )}

        {/* 要相談商品 */}
        {negotiableItems.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="mb-3 text-sm font-medium text-amber-800">
              要相談商品（Invoice発行時に価格を入力）
            </h2>
            <ul className="divide-y divide-amber-200">
              {negotiableItems.map((item) => (
                <li key={item.id} className="py-2 text-sm">
                  <p className="font-medium">{item.product_name_snapshot}</p>
                  <p className="text-xs text-amber-700">
                    数量：{item.quantity}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Invoice発行フォーム */}
        {negotiableItems.length > 0 && (
          <section className="rounded-lg border p-5">
            <InvoiceForm orderId={order.id} negotiableItems={negotiableItems} />
          </section>
        )}
      </div>
    </div>
  );
}
