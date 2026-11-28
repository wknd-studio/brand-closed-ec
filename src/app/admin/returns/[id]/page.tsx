import Link from "next/link";
import { notFound } from "next/navigation";
import { adminReturnQueryService } from "@/composition/admin-return";
import type { AdminReturnItemDto } from "@/queries/admin-return-query-service";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Heading } from "@/components/ui/heading";
import { RETURN_STATUS } from "@/app/admin/returns/return-status";
import {
  approveReturnAction,
  rejectReturnAction,
  updateReturnAdminNoteAction,
} from "./actions";
import ReturnReviewForm from "./return-review-form";

type Props = {
  params: Promise<{ id: string }>;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function ItemList({ items }: { items: AdminReturnItemDto[] }) {
  return (
    <ul className="divide-y divide-neutral-200">
      {items.map((item) => (
        <li
          key={item.orderItemId}
          className="flex items-center justify-between gap-4 py-2 text-sm"
        >
          <span>{item.productName}</span>
          <span className="whitespace-nowrap tabular-nums text-secondary">
            返品 {item.quantity} ／ 注文 {item.orderedQuantity}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminReturnDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await adminReturnQueryService().findDetail(id);
  if (!detail) notFound();

  const status = RETURN_STATUS[detail.status];

  return (
    <Container className="max-w-3xl space-y-6 py-10">
      <Link
        href="/admin/returns"
        className="inline-flex items-center gap-1 text-sm text-secondary hover:text-neutral-900"
      >
        ← 返品管理
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <Heading as="h1" level="compact">
          返品申請
        </Heading>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <Card className="p-5">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-secondary">注文番号</dt>
          <dd>
            <Link
              href={`/admin/orders/${detail.orderId}`}
              className="font-mono text-xs text-primary hover:underline"
            >
              {detail.orderNumber}
            </Link>
          </dd>
          <dt className="text-secondary">申請日時</dt>
          <dd>{formatDateTime(detail.createdAt)}</dd>
          <dt className="text-secondary">申請者</dt>
          <dd>
            {detail.requester
              ? `${detail.requester.name}（${detail.requester.email}）`
              : `運営者が作成（${detail.createdByAdminName ?? "—"}）`}
          </dd>
          <dt className="text-secondary">理由</dt>
          <dd className="whitespace-pre-wrap">{detail.reason}</dd>
          {detail.reviewedByAdminName && (
            <>
              <dt className="text-secondary">確認した運営者</dt>
              <dd>{detail.reviewedByAdminName}</dd>
            </>
          )}
          {detail.approvedAt && (
            <>
              <dt className="text-secondary">承認日時</dt>
              <dd>{formatDateTime(detail.approvedAt)}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-medium">返品する明細</h2>
        <ItemList items={detail.items} />
      </Card>

      {detail.siblings.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-medium">同じ送信のほかの申請</h2>
          <p className="mb-3 text-xs text-secondary">
            会員が1回で申請した明細のうち、支払いのまとまりが違うものです。承認・却下は申請ごとに行います
          </p>
          <ul className="space-y-3">
            {detail.siblings.map((sibling) => (
              <li key={sibling.id} className="space-y-1">
                <div className="flex items-center gap-3">
                  <Badge tone={RETURN_STATUS[sibling.status].tone}>
                    {RETURN_STATUS[sibling.status].label}
                  </Badge>
                  <Link
                    href={`/admin/returns/${sibling.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    詳細
                  </Link>
                </div>
                <ItemList items={sibling.items} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReturnReviewForm
        returnId={detail.id}
        adminNote={detail.adminNote ?? ""}
        canReview={detail.status === "requested"}
        approve={approveReturnAction}
        reject={rejectReturnAction}
        saveNote={updateReturnAdminNoteAction}
      />
    </Container>
  );
}
