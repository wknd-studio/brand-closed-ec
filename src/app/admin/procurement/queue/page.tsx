import Link from "next/link";
import { procurementQueueQueryService } from "@/composition/procurement-queue-query";
import type {
  ProcurementQueueItemDto,
  ProcurementQueueSort,
} from "@/queries/procurement-queue-query-service";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { Heading } from "@/components/ui/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";

const SORT_OPTIONS: { value: ProcurementQueueSort; label: string }[] = [
  { value: "queued", label: "対応待ちになった順" },
  { value: "product", label: "ブランド・商品順" },
];

const PAYMENT_TIMING: Record<
  ProcurementQueueItemDto["paymentTiming"],
  { label: string; tone: "primary" | "neutral" }
> = {
  at_order: { label: "注文時払い", tone: "primary" },
  after_order: { label: "注文後払い", tone: "neutral" },
};

function parseSort(raw: string | string[] | undefined): ProcurementQueueSort {
  return raw === "product" ? "product" : "queued";
}

export default async function ProcurementQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const sort = parseSort((await searchParams).sort);
  const items = await procurementQueueQueryService().findQueueItems({ sort });

  return (
    <Container className="space-y-6 py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-secondary hover:text-neutral-900"
      >
        ← 管理メニュー
      </Link>
      <div className="space-y-2">
        <Heading as="h1" level="compact">
          対応待ちキュー
        </Heading>
        <p className="text-sm text-secondary">
          まだどの発注タスクにも入っていない注文明細です（{items.length}件）
        </p>
      </div>

      <nav aria-label="並び順" className="flex gap-2 text-sm">
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={
              option.value === "queued"
                ? "/admin/procurement/queue"
                : `/admin/procurement/queue?sort=${option.value}`
            }
            aria-current={option.value === sort ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 transition-colors",
              option.value === sort
                ? "border-primary text-primary"
                : "border-neutral-200 text-secondary hover:border-primary hover:text-primary"
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="text-sm text-secondary">対応待ちの明細はありません</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品名</TableHead>
              <TableHead>ブランド</TableHead>
              <TableHead className="text-right">数量</TableHead>
              <TableHead>注文日</TableHead>
              <TableHead>支払いタイミング</TableHead>
              <TableHead>注文番号</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.orderItemId}>
                <TableCell className="min-w-48">{item.productName}</TableCell>
                <TableCell>{item.brandName ?? "—"}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="whitespace-nowrap text-secondary">
                  {new Date(item.orderedAt).toLocaleDateString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </TableCell>
                <TableCell>
                  <Badge tone={PAYMENT_TIMING[item.paymentTiming].tone}>
                    {PAYMENT_TIMING[item.paymentTiming].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/orders/${item.orderId}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {item.orderNumber}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  );
}
