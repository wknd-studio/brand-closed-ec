import Link from "next/link";
import { notFound } from "next/navigation";
import { procurementTaskQueryService } from "@/composition/procurement-task-query";
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
import {
  TASK_STATUS,
  formatDateTime,
} from "@/app/admin/procurement/tasks/task-status";

export default async function ProcurementTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await procurementTaskQueryService().findTaskDetail({
    taskId: id,
  });
  if (!task) notFound();

  return (
    <Container className="space-y-8 py-10">
      <Link
        href="/admin/procurement/tasks"
        className="inline-flex items-center gap-1 text-sm text-secondary hover:text-neutral-900"
      >
        ← 発注タスク一覧
      </Link>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Heading as="h1" level="compact">
            発注タスクの詳細
          </Heading>
          <Badge tone={TASK_STATUS[task.status].tone}>
            {TASK_STATUS[task.status].label}
          </Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-secondary">担当者</dt>
          <dd>{task.assigneeName ?? "—"}</dd>
          <dt className="text-secondary">作成日時</dt>
          <dd>{formatDateTime(task.createdAt)}</dd>
          <dt className="text-secondary">発注日時</dt>
          <dd>{formatDateTime(task.orderedAt)}</dd>
          <dt className="text-secondary">メモ</dt>
          <dd className="whitespace-pre-wrap">{task.notes ?? "—"}</dd>
        </dl>
      </div>

      {task.items.length === 0 ? (
        <p className="text-sm text-secondary">このタスクに明細はありません</p>
      ) : (
        <>
          <section className="space-y-3">
            <Heading as="h2" level="compact" id="product-totals">
              商品ごとの合計
            </Heading>
            <Table aria-labelledby="product-totals">
              <TableHeader>
                <TableRow>
                  <TableHead>商品名</TableHead>
                  <TableHead className="text-right">合計必要数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {task.productTotals.map((total) => (
                  <TableRow key={total.sanityProductId}>
                    <TableCell className="min-w-48">
                      {total.productName}
                    </TableCell>
                    <TableCell className="text-right">
                      {total.totalQuantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="space-y-3">
            <Heading as="h2" level="compact" id="task-items">
              明細
            </Heading>
            <Table aria-labelledby="task-items">
              <TableHeader>
                <TableRow>
                  <TableHead>商品名</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead>注文番号</TableHead>
                  <TableHead>発送拠点</TableHead>
                  <TableHead>入荷日時</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {task.items.map((item) => (
                  <TableRow key={item.orderItemId}>
                    <TableCell className="min-w-48">
                      {item.productName}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${item.orderId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {item.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{item.fulfillmentLocationName}</TableCell>
                    <TableCell className="whitespace-nowrap text-secondary">
                      {formatDateTime(item.receivedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
    </Container>
  );
}
