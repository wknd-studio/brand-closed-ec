import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/current-user";
import { memberOrderQueryService } from "@/composition/member-order-query";
import { ReturnReason } from "@/domain/value-objects/return-reason";
import type {
  CompletedOrderItemDto,
  OrderDetailAddressDto,
} from "@/queries/member-order-query-service";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card, cardVariants } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { cn } from "@/lib/cn";
import {
  ORDER_STATUS_TONES,
  SETTLEMENT_STATUS_TONES,
  formatOrderDate,
  type BadgeTone,
} from "@/app/(member)/orders/order-display";
import { requestReturnAction } from "./actions";
import { ReturnRequestForm } from "./return-request-form";

type Props = {
  params: Promise<{ id: string }>;
};

function ItemList({ items }: { items: CompletedOrderItemDto[] }) {
  return (
    <ul className="border-t border-neutral-100">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex justify-between gap-3 border-b border-neutral-100 py-2.5 text-sm"
        >
          <span>{item.productNameSnapshot}</span>
          <span className="whitespace-nowrap text-neutral-700 tabular-nums">
            {item.unitPriceSnapshot === null
              ? "価格要相談"
              : `¥${item.unitPriceSnapshot.toLocaleString()}`}{" "}
            × {item.quantity}
          </span>
        </li>
      ))}
    </ul>
  );
}

// お支払いごとの明細の1枚。region の名前は、支払い方法の印を除いた title だけにする
function SettlementCard({
  id,
  method,
  title,
  status,
  amount,
  note,
  items,
}: {
  id: string;
  method: { label: string; tone: BadgeTone };
  title: string;
  status: { label: string; tone: BadgeTone };
  amount?: string;
  note?: string;
  items: CompletedOrderItemDto[];
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(cardVariants(), "flex flex-col gap-2.5 px-5 py-[18px]")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="inline-flex items-center gap-2 text-[15px] font-semibold">
            <Badge tone={method.tone}>{method.label}</Badge>
            <span id={id}>{title}</span>
          </h3>
          {/* 上限超過の文言は長いため、バッジの中で折り返させる */}
          <Badge tone={status.tone} className="self-start whitespace-normal!">
            {status.label}
          </Badge>
        </div>
        {amount && (
          <span className="text-lg font-bold tabular-nums">{amount}</span>
        )}
      </div>
      {note && <p className="text-xs leading-[1.7] text-neutral-700">{note}</p>}
      <ItemList items={items} />
    </section>
  );
}

const CHECKOUT_METHOD = { label: "カード", tone: "primary" } as const;
const INVOICE_METHOD = { label: "請求書", tone: "info" } as const;

function Address({
  title,
  address,
}: {
  title: string;
  address: OrderDetailAddressDto;
}) {
  return (
    <Card className="flex flex-col gap-1.5 px-5 py-[18px]">
      <h3 className="mb-1 text-xs font-semibold text-neutral-700">{title}</h3>
      <address className="text-sm leading-[1.8] not-italic">
        {address.fullName}
        <br />〒{address.postalCode}
        <br />
        {address.prefecture}
        {address.city}
        {address.addressLine1}
        {address.addressLine2 && ` ${address.addressLine2}`}
        <br />
        {address.phoneNumber}
      </address>
    </Card>
  );
}

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3.5">
      <dt className="text-xs text-neutral-700">{label}</dt>
      <dd className="text-[15px]">{children}</dd>
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

  const { orderNumber } = order;
  const hasPayments =
    order.settlements.length > 0 || order.unassignedItems.length > 0;

  return (
    <Container className="flex flex-col gap-5 pt-4 pb-14 lg:gap-7 lg:pt-7 lg:pb-20">
      <Breadcrumb
        items={[
          { label: "注文履歴", href: "/orders" },
          { label: `注文番号 ${orderNumber}` },
        ]}
      />

      <div className="flex flex-col gap-2.5">
        <Eyebrow withLine>ORDER</Eyebrow>
        <Heading as="h1" level="compact">
          注文詳細
        </Heading>
      </div>

      <section
        aria-label="注文の概要"
        className={cn(cardVariants(), "rounded-3xl px-6 py-2")}
      >
        <dl className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
          <SummaryItem label="注文番号">
            <span className="font-semibold tracking-[0.04em]">
              {orderNumber}
            </span>
          </SummaryItem>
          <SummaryItem label="注文日">
            <span className="tabular-nums">
              {formatOrderDate(order.createdAt)}
            </span>
          </SummaryItem>
          <SummaryItem label="状態">
            <Badge tone={ORDER_STATUS_TONES[order.status.value]}>
              {order.status.label()}
            </Badge>
          </SummaryItem>
          <SummaryItem label="注文時のプラン">
            {order.rankAtOrder.value.toUpperCase()}
          </SummaryItem>
        </dl>
      </section>

      {hasPayments && (
        <section aria-labelledby="payments" className="flex flex-col gap-3">
          <h2 id="payments" className="text-[17px] font-semibold">
            お支払いごとの明細
          </h2>
          {order.settlements.map((settlement) => (
            <SettlementCard
              key={settlement.id}
              id={`settlement-${settlement.id}`}
              method={
                settlement.flow === "checkout"
                  ? CHECKOUT_METHOD
                  : INVOICE_METHOD
              }
              title={settlement.flowLabel}
              status={{
                label: settlement.statusLabel,
                tone: SETTLEMENT_STATUS_TONES[settlement.status],
              }}
              amount={`¥${settlement.amount.toLocaleString()}`}
              items={settlement.items}
            />
          ))}
          {order.unassignedItems.length > 0 && (
            // 請求書を発行するまで金額は決まらないため、金額は出さない
            <SettlementCard
              id="unassigned-items"
              method={INVOICE_METHOD}
              title="請求前"
              status={{
                label: "まだ請求書は発行されていません",
                tone: "neutral",
              }}
              note="注文後に請求書をお送りする商品です。"
              items={order.unassignedItems}
            />
          )}
        </section>
      )}

      <section aria-labelledby="addresses" className="flex flex-col gap-3">
        <h2 id="addresses" className="text-[17px] font-semibold">
          お届け先・ご請求先
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Address title="お届け先" address={order.shippingAddress} />
          <Address title="ご請求先" address={order.billingAddress} />
        </div>
      </section>

      {/* 申請できる明細が無ければ何も出さない。全数量を申請した直後も受け付けの表示を残すため、常に置く */}
      <ReturnRequestForm
        items={order.returnableItems}
        reasonOptions={ReturnReason.options()}
        action={requestReturnAction.bind(null, order.orderId)}
      />
    </Container>
  );
}
