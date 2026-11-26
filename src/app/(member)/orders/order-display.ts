import type { badgeVariants } from "@/components/ui/badge";
import type { SettlementStatus } from "@/domain/entities/order-settlement";
import type { OrderStatusValue } from "@/domain/value-objects/order-status";
import type { VariantProps } from "class-variance-authority";

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

// 注文履歴・注文詳細で、注文の状態を出す Badge の色
export const ORDER_STATUS_TONES: Record<OrderStatusValue, BadgeTone> = {
  paid: "success",
  processing: "primary",
  limit_exceeded: "warning",
  cancelled: "neutral",
};

// 注文詳細で、お支払いごとの明細の状態を出す Badge の色
export const SETTLEMENT_STATUS_TONES: Record<SettlementStatus, BadgeTone> = {
  paid: "success",
  pending_payment: "primary",
  invoice_sent: "primary",
  limit_exceeded: "warning",
  cancelled: "neutral",
};

// 注文日を「2026/11/24」の形で出す。実行環境（WorkersはUTC）ではなくJSTの日付
export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
