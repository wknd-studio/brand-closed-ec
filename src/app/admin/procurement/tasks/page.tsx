import Link from "next/link";
import { procurementTaskQueryService } from "@/composition/procurement-task-query";
import type { ProcurementTaskStatusFilter } from "@/queries/procurement-task-query-service";
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
import { TASK_STATUS, formatDateTime } from "./task-status";

const STATUS_OPTIONS: { value: ProcurementTaskStatusFilter; label: string }[] =
  [
    { value: "active", label: "取消以外" },
    { value: "pending", label: TASK_STATUS.pending.label },
    { value: "claimed", label: TASK_STATUS.claimed.label },
    { value: "ordered", label: TASK_STATUS.ordered.label },
    { value: "cancelled", label: TASK_STATUS.cancelled.label },
  ];

function parseStatus(
  raw: string | string[] | undefined
): ProcurementTaskStatusFilter {
  return (
    STATUS_OPTIONS.find((option) => option.value === raw)?.value ?? "active"
  );
}

export default async function ProcurementTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const status = parseStatus((await searchParams).status);
  const tasks = await procurementTaskQueryService().findTasks({ status });

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
          発注タスク
        </Heading>
        <p className="text-sm text-secondary">
          仕入れ先への発注の進み具合です（{tasks.length}
          件）。まだタスクに入っていない明細は
          <Link
            href="/admin/procurement/queue"
            className="text-primary hover:underline"
          >
            対応待ちキュー
          </Link>
          にあります
        </p>
      </div>

      <nav
        aria-label="ステータスの絞り込み"
        className="flex flex-wrap gap-2 text-sm"
      >
        {STATUS_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={
              option.value === "active"
                ? "/admin/procurement/tasks"
                : `/admin/procurement/tasks?status=${option.value}`
            }
            aria-current={option.value === status ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 transition-colors",
              option.value === status
                ? "border-primary text-primary"
                : "border-neutral-200 text-secondary hover:border-primary hover:text-primary"
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {tasks.length === 0 ? (
        <p className="text-sm text-secondary">発注タスクはありません</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ステータス</TableHead>
              <TableHead>担当者</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead>発注日時</TableHead>
              <TableHead className="text-right">明細数</TableHead>
              <TableHead>
                <span className="sr-only">詳細</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.taskId}>
                <TableCell>
                  <Badge tone={TASK_STATUS[task.status].tone}>
                    {TASK_STATUS[task.status].label}
                  </Badge>
                </TableCell>
                <TableCell>{task.assigneeName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-secondary">
                  {formatDateTime(task.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-secondary">
                  {formatDateTime(task.orderedAt)}
                </TableCell>
                <TableCell className="text-right">{task.itemCount}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/procurement/tasks/${task.taskId}`}
                    className="whitespace-nowrap text-primary hover:underline"
                  >
                    詳細
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
