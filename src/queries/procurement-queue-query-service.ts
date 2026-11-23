import type { PaymentTiming } from "@/domain/entities/order-item";

// queued: 対応待ちになった順（古い順）。product: 同じ商品の明細が隣り合うよう、ブランド・商品名で並べる
export type ProcurementQueueSort = "queued" | "product";

// 対応待ちキュー（/admin/procurement/queue）の1行。まだどの発注タスクにも入っていない明細
export type ProcurementQueueItemDto = {
  orderItemId: string;
  orderId: string;
  sanityProductId: string;
  productName: string;
  // Sanity の商品のブランド名。商品・ブランドが Sanity から消えていれば null
  brandName: string | null;
  quantity: number;
  // 注文日時（ISO 文字列）。対応待ちになった時刻として扱う（docs/domain/procurement.md）
  orderedAt: string;
  paymentTiming: PaymentTiming;
};

export interface ProcurementQueueQueryService {
  findQueueItems(input: {
    sort: ProcurementQueueSort;
  }): Promise<ProcurementQueueItemDto[]>;
}
