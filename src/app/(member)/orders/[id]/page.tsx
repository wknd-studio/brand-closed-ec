import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { memberOrderQueryService } from "@/composition/member-order-query";
import type {
  CompletedOrderItemDto,
  OrderDetailAddressDto,
} from "@/queries/member-order-query-service";

type Props = {
  params: Promise<{ id: string }>;
};

function ItemList({ items }: { items: CompletedOrderItemDto[] }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-4 py-2 text-sm"
        >
          <p>{item.productNameSnapshot}</p>
          <p className="shrink-0 text-right tabular-nums text-gray-600">
            {item.unitPriceSnapshot === null
              ? "価格要相談"
              : `¥${item.unitPriceSnapshot.toLocaleString()}`}{" "}
            × {item.quantity}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Address({
  title,
  address,
}: {
  title: string;
  address: OrderDetailAddressDto;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs text-gray-500">{title}</h3>
      <address className="text-sm not-italic">
        <p>{address.fullName}</p>
        <p>〒{address.postalCode}</p>
        <p>
          {address.prefecture}
          {address.city}
          {address.addressLine1}
          {address.addressLine2 && ` ${address.addressLine2}`}
        </p>
        <p>{address.phoneNumber}</p>
      </address>
    </div>
  );
}

export default async function OrderDetailPage({ params }: Props) {
  const { userId } = await requireAuth();
  const { id } = await params;
  const order = await (
    await memberOrderQueryService()
  ).findOrderDetail({ clerkUserId: userId!, orderId: id });
  // 他の会員の注文・存在しない注文は、存在を明かさないよう同じ 404 にする
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/orders" className="text-sm text-gray-500 underline">
        注文履歴に戻る
      </Link>
      <h1 className="mb-8 mt-4 text-xl font-semibold">注文詳細</h1>

      <div className="space-y-6">
        <section className="rounded-lg border p-5">
          <dl className="space-y-1 text-sm">
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">注文番号</dt>
              <dd className="font-mono text-xs leading-5">
                {order.orderId.slice(0, 8).toUpperCase()}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">注文日</dt>
              <dd>
                {new Date(order.createdAt).toLocaleDateString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">ステータス</dt>
              <dd>{order.status.label()}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-24 text-gray-500">注文時のランク</dt>
              <dd>{order.rankAtOrder.value.toUpperCase()}</dd>
            </div>
          </dl>
        </section>

        {order.settlements.map((settlement) => (
          <section
            key={settlement.id}
            aria-labelledby={`settlement-${settlement.id}`}
            className="rounded-lg border p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2
                  id={`settlement-${settlement.id}`}
                  className="text-sm font-medium text-gray-700"
                >
                  {settlement.flowLabel}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {settlement.statusLabel}
                </p>
              </div>
              <p className="tabular-nums">
                ¥{settlement.amount.toLocaleString()}
              </p>
            </div>
            <ItemList items={settlement.items} />
          </section>
        ))}

        {order.unassignedItems.length > 0 && (
          <section
            aria-labelledby="unassigned-items"
            className="rounded-lg border p-5"
          >
            <h2
              id="unassigned-items"
              className="text-sm font-medium text-gray-700"
            >
              請求前
            </h2>
            <p className="mb-3 mt-1 text-xs text-gray-500">
              注文後に請求書をお送りする商品です（まだ請求書は発行されていません）
            </p>
            <ItemList items={order.unassignedItems} />
          </section>
        )}

        <section className="rounded-lg border p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            お届け先・ご請求先
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Address title="配送先" address={order.shippingAddress} />
            <Address title="請求先" address={order.billingAddress} />
          </div>
        </section>
      </div>
    </main>
  );
}
