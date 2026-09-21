import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import CancelOrderButton from "./cancel-order-button";

type Props = {
  params: Promise<{ id: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  processing: "対応中",
  limit_exceeded: "上限超過・発行停止",
  paid: "入金確認済み",
  cancelled: "キャンセル",
};

const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  pending_payment: "決済待ち",
  invoice_sent: "請求書送付済み",
  limit_exceeded: "上限超過・発行停止",
  paid: "入金確認済み",
  cancelled: "キャンセル",
};

const FLOW_LABEL: Record<string, string> = {
  checkout: "先払い（Checkout）",
  invoice: "後払い（Invoice）",
};

const TIMING_LABEL: Record<string, string> = {
  at_order: "注文時払い",
  after_order: "注文後払い",
};

export default async function AdminOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();
  const orderRepo = new SupabaseOrderRepository(supabase);

  const order = await orderRepo.findByIdWithUser(id);
  if (!order) notFound();

  const settlementById = new Map(order.settlements.map((s) => [s.id, s]));
  const total = order.items.reduce(
    (sum, i) => sum + (i.unitPriceSnapshot ?? 0) * i.quantity,
    0
  );
  const canCancel =
    (order.status === "processing" || order.status === "limit_exceeded") &&
    !order.settlements.some((s) => s.status === "paid");

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
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <div className="space-y-6">
        {order.status === "limit_exceeded" && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-medium text-red-700">
              月次仕入れ上限超過のため請求書を発行できません
            </p>
            <p className="mt-1 text-xs text-red-600">
              会員に上限超過の通知メールを送信済みです。
            </p>
          </section>
        )}

        {/* 会員情報 */}
        <section className="rounded-lg border p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">会員情報</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">氏名</dt>
              <dd>
                {order.user
                  ? `${order.user.lastName} ${order.user.firstName}`
                  : "—"}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">メール</dt>
              <dd>{order.user?.email ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">注文日時</dt>
              <dd>{order.createdAt.toLocaleString("ja-JP")}</dd>
            </div>
          </dl>
        </section>

        {/* 決済単位 */}
        <section className="rounded-lg border p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">決済単位</h2>
          {order.settlements.length === 0 ? (
            <p className="text-sm text-gray-500">
              決済単位はまだありません（後払い商品は請求作成前です）
            </p>
          ) : (
            <ul className="divide-y">
              {order.settlements.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {FLOW_LABEL[s.flow] ?? s.flow}
                    </p>
                    <p className="text-xs text-gray-500">
                      {SETTLEMENT_STATUS_LABEL[s.status] ?? s.status}
                    </p>
                  </div>
                  <p className="tabular-nums">¥{s.amount.toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 注文明細 */}
        <section className="rounded-lg border p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">注文明細</h2>
          <ul className="divide-y">
            {order.items.map((item) => {
              const settlement = item.settlementId
                ? settlementById.get(item.settlementId)
                : undefined;
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{item.productNameSnapshot}</p>
                    <p className="text-xs text-gray-500">
                      × {item.quantity} ／{" "}
                      {TIMING_LABEL[item.paymentTiming] ?? item.paymentTiming}{" "}
                      ／{" "}
                      {settlement
                        ? (SETTLEMENT_STATUS_LABEL[settlement.status] ??
                          settlement.status)
                        : "未請求"}
                    </p>
                  </div>
                  <p className="tabular-nums">
                    ¥
                    {(
                      (item.unitPriceSnapshot ?? 0) * item.quantity
                    ).toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-between border-t pt-3 text-sm font-medium">
            <span>合計</span>
            <span className="tabular-nums">¥{total.toLocaleString()}</span>
          </div>
        </section>

        {canCancel && <CancelOrderButton orderId={order.id} />}
      </div>
    </div>
  );
}
