import type { ProcurementTaskStatus } from "@/queries/procurement-task-query-service";

// 一覧・詳細で共通のステータスの表示
export const TASK_STATUS: Record<
  ProcurementTaskStatus,
  { label: string; tone: "neutral" | "warning" | "success" | "danger" }
> = {
  pending: { label: "未着手", tone: "neutral" },
  claimed: { label: "着手中", tone: "warning" },
  ordered: { label: "発注済み", tone: "success" },
  cancelled: { label: "取消", tone: "danger" },
};

export function formatDateTime(iso: string | null): string {
  return iso === null
    ? "—"
    : new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
