import type { ReturnStatus } from "@/domain/entities/return-request";

// 返品明細の1行。数量は返品する数量、注文数量は元の注文明細の数量
export type AdminReturnItemDto = {
  orderItemId: string;
  productName: string;
  quantity: number;
  orderedQuantity: number;
};

// 申請1件の状態と明細
export type AdminReturnSummaryDto = {
  id: string;
  status: ReturnStatus;
  items: AdminReturnItemDto[];
};

// 返品管理の一覧（/admin/returns）の1行。会員が1回の送信で選んだ明細は、支払いのまとまりごとの申請に
// 分けて1回の INSERT で保存されるため（#381）、同じ注文・同じ作成日時の申請を同じ送信として1つにまとめる
export type AdminReturnSubmissionDto = {
  orderId: string;
  // 表示の形（OrderNumber.display()）
  orderNumber: string;
  // 申請日時（ISO 文字列）
  createdAt: string;
  // 申請した会員の氏名。回収不能処理で運営者が作った申請では null
  requesterName: string | null;
  returns: AdminReturnSummaryDto[];
};

// 返品管理の詳細（/admin/returns/[id]）
export type AdminReturnDetailDto = AdminReturnSummaryDto & {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  reason: string;
  adminNote: string | null;
  // 申請した会員。運営者が作った申請では null（代わりに createdByAdminName を持つ）
  requester: { name: string; email: string } | null;
  createdByAdminName: string | null;
  // 承認・却下した運営者。まだ確認していなければ null
  reviewedByAdminName: string | null;
  approvedAt: string | null;
  // 同じ送信で作られたほかの申請（自分を除く）
  siblings: AdminReturnSummaryDto[];
};

export interface AdminReturnQueryService {
  /** 申請を新しい送信から順に、送信ごとにまとめて返す。status を渡すとその状態の申請だけにする */
  findSubmissions(input: {
    status: ReturnStatus | null;
  }): Promise<AdminReturnSubmissionDto[]>;
  /** 申請の詳細。無ければ（IDが UUID の形でなければ）null */
  findDetail(returnId: string): Promise<AdminReturnDetailDto | null>;
}
