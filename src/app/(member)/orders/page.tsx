import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { memberOrderQueryService } from "@/composition/member-order-query";
import type { OrderHistoryItemDto } from "@/queries/member-order-query-service";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { cn } from "@/lib/cn";
import {
  ORDER_STATUS_TONES,
  formatOrderDate,
  formatOrderNumber,
} from "./order-display";

const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

// URL の page が数字でない・1未満・offset が安全な整数に収まらないなら1ページ目にする
function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page * PAGE_SIZE) && page >= 1 ? page : 1;
}

function OrderRow({ order }: { order: OrderHistoryItemDto }) {
  return (
    <li>
      <Link
        href={`/orders/${order.orderId}`}
        className={cn(
          cardVariants(),
          "grid grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none md:grid-cols-[minmax(0,1fr)_220px_180px_18px] md:gap-5 md:py-[18px] md:pr-5 md:pl-6"
        )}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-neutral-700 tabular-nums">
            {formatOrderDate(order.createdAt)}
          </span>
          <span className="text-[15px] font-semibold tracking-[0.04em] whitespace-nowrap tabular-nums">
            注文番号 {formatOrderNumber(order.orderId)}
          </span>
          <span className="text-xs text-neutral-700">{order.itemCount}点</span>
        </span>
        <Badge
          tone={ORDER_STATUS_TONES[order.status.value]}
          // スマホ幅では日付・番号の下の行に置く
          className="col-span-2 row-start-2 justify-self-start md:col-span-1 md:row-start-auto"
        >
          {order.status.label()}
        </Badge>
        <span className="col-start-2 row-start-1 flex flex-col items-end gap-0.5 text-right md:col-start-auto md:row-start-auto">
          <span className="text-[17px] font-bold tabular-nums">
            ¥{order.fixedTotal.toLocaleString()}
          </span>
          {order.includesNegotiable && (
            <span className="text-[11px] text-neutral-700">
              ＋価格未確定の商品を含む
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="col-start-3 row-span-2 row-start-1 size-[18px] shrink-0 justify-self-end text-neutral-600 md:col-start-auto md:row-span-1 md:row-start-auto"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>
    </li>
  );
}

const pagerLinkClass = buttonVariants({ variant: "secondary", size: "sm" });

function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  const disabledClass =
    "inline-flex h-10 items-center rounded-full border border-neutral-200 px-5 text-[0.85rem] font-semibold tracking-[0.04em] text-neutral-400";
  return (
    <nav
      aria-label="ページ送り"
      className="flex flex-wrap items-center justify-center gap-3"
    >
      {page > 1 ? (
        <Link href={`/orders?page=${page - 1}`} className={pagerLinkClass}>
          新しい注文
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          新しい注文
        </span>
      )}
      <span className="text-[13px] text-neutral-700 tabular-nums">
        {page} / {totalPages} ページ
      </span>
      {page < totalPages ? (
        <Link href={`/orders?page=${page + 1}`} className={pagerLinkClass}>
          古い注文
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          古い注文
        </span>
      )}
    </nav>
  );
}

function EmptyState({ hasOrders }: { hasOrders: boolean }) {
  return (
    <div
      className={cn(
        cardVariants(),
        "flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center"
      )}
    >
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-6"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
      </span>
      {hasOrders ? (
        // URL で範囲外のページを開いたとき
        <>
          <p className="text-base font-semibold">
            このページに注文はありません
          </p>
          <Link
            href="/orders"
            className={cn(buttonVariants({ variant: "secondary" }), "mt-1")}
          >
            1ページ目に戻る
          </Link>
        </>
      ) : (
        <>
          <p className="text-base font-semibold">注文はまだありません</p>
          <Link href="/shop" className={cn(buttonVariants(), "mt-1")}>
            ショップを見る
          </Link>
        </>
      )}
    </div>
  );
}

export default async function OrdersPage({ searchParams }: Props) {
  const { userId } = await requireAuth();
  const page = parsePage((await searchParams).page);
  const history = await (
    await memberOrderQueryService()
  ).findOrderHistory({ clerkUserId: userId!, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(history.totalCount / PAGE_SIZE));

  return (
    <Container className="flex flex-col gap-5 pt-6 pb-14 lg:gap-7 lg:pt-12 lg:pb-20">
      <div className="flex flex-col gap-2.5">
        <Eyebrow withLine>MY PAGE</Eyebrow>
        <Heading as="h1" level="compact">
          注文履歴
        </Heading>
        <p className="text-sm leading-[1.8] text-neutral-700">
          ご注文の状況と、お支払いの状況を確かめられます。
        </p>
      </div>

      {history.orders.length === 0 ? (
        <EmptyState hasOrders={history.totalCount > 0} />
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {history.orders.map((order) => (
              <OrderRow key={order.orderId} order={order} />
            ))}
          </ul>
          {history.totalCount > PAGE_SIZE && (
            <Pager page={page} totalPages={totalPages} />
          )}
        </>
      )}
    </Container>
  );
}
