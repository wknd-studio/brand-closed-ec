import Link from "next/link";
import { adminReturnQueryService } from "@/composition/admin-return";
import type { ReturnStatus } from "@/domain/entities/return-request";
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
import { RETURN_STATUS, RETURN_STATUSES } from "./return-status";

function parseStatus(raw: string | string[] | undefined): ReturnStatus | null {
  return RETURN_STATUSES.find((status) => status === raw) ?? null;
}

const FILTERS: { value: ReturnStatus | null; label: string }[] = [
  { value: null, label: "すべて" },
  ...RETURN_STATUSES.map((status) => ({
    value: status,
    label: RETURN_STATUS[status].label,
  })),
];

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const status = parseStatus((await searchParams).status);
  const submissions = await adminReturnQueryService().findSubmissions({
    status,
  });

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
          返品管理
        </Heading>
        <p className="text-sm text-secondary">
          会員からの返品・返金の申請です。1回の送信で選ばれた明細は、支払いのまとまりごとの申請に分かれ、同じ行に並びます
        </p>
      </div>

      <nav aria-label="状態で絞り込む" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value ?? "all"}
            href={
              filter.value
                ? `/admin/returns?status=${filter.value}`
                : "/admin/returns"
            }
            aria-current={filter.value === status ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 transition-colors",
              filter.value === status
                ? "border-primary text-primary"
                : "border-neutral-200 text-secondary hover:border-primary hover:text-primary"
            )}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {submissions.length === 0 ? (
        <p className="text-sm text-secondary">返品申請はありません</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申請日時</TableHead>
              <TableHead>注文番号</TableHead>
              <TableHead>申請者</TableHead>
              <TableHead>申請（支払いのまとまりごと）</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((submission) => (
              <TableRow key={`${submission.orderId}|${submission.createdAt}`}>
                <TableCell className="whitespace-nowrap align-top text-secondary">
                  {new Date(submission.createdAt).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                </TableCell>
                <TableCell className="align-top">
                  <Link
                    href={`/admin/orders/${submission.orderId}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {submission.orderNumber}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap align-top">
                  {submission.requesterName ?? "運営者が作成"}
                </TableCell>
                <TableCell className="min-w-72">
                  <ul className="space-y-2">
                    {submission.returns.map((returnRequest) => (
                      <li
                        key={returnRequest.id}
                        className="flex items-start gap-3"
                      >
                        <Badge tone={RETURN_STATUS[returnRequest.status].tone}>
                          {RETURN_STATUS[returnRequest.status].label}
                        </Badge>
                        <span className="flex-1">
                          {returnRequest.items
                            .map(
                              (item) => `${item.productName} × ${item.quantity}`
                            )
                            .join("、")}
                        </span>
                        <Link
                          href={`/admin/returns/${returnRequest.id}`}
                          className="whitespace-nowrap text-primary hover:underline"
                        >
                          詳細
                        </Link>
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  );
}
