import type { ReturnStatus } from "@/domain/entities/return-request";

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

// 返品申請の状態の表示（一覧・詳細で共通）
export const RETURN_STATUS: Record<
  ReturnStatus,
  { label: string; tone: BadgeTone }
> = {
  requested: { label: "申請中", tone: "warning" },
  approved: { label: "承認済み", tone: "primary" },
  rejected: { label: "却下", tone: "danger" },
  received: { label: "返送受領", tone: "primary" },
  refunded: { label: "解決済み", tone: "success" },
  cancelled: { label: "取消", tone: "neutral" },
};

export const RETURN_STATUSES = Object.keys(RETURN_STATUS) as ReturnStatus[];
