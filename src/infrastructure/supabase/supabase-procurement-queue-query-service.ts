import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PaymentTiming } from "@/domain/entities/order-item";
import type {
  ProcurementQueueItemDto,
  ProcurementQueueQueryService,
  ProcurementQueueSort,
} from "@/queries/procurement-queue-query-service";

type QueueItemRow = {
  id: string;
  order_id: string;
  sanity_product_id: string;
  product_name_snapshot: string;
  quantity: number;
  payment_timing: string;
  created_at: string;
  orders: { created_at: string };
};

const QUEUE_ITEM_COLUMNS =
  "id, order_id, sanity_product_id, product_name_snapshot, quantity, payment_timing, created_at, orders!inner(created_at, status)";

// 対応待ちになった順（docs/domain/procurement.md「キューの並び順」）。基準は注文日時とし、
// at_order の決済完了時刻との差は無視する（#348 の懸念 (a)）。同じ注文の中は明細の作成順
function compareQueued(a: QueueItemRow, b: QueueItemRow): number {
  return (
    Date.parse(a.orders.created_at) - Date.parse(b.orders.created_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

// ブランドが分からない明細は最後にする
function compareProduct(
  a: ProcurementQueueItemDto,
  b: ProcurementQueueItemDto
): number {
  if (a.brandName !== b.brandName) {
    if (a.brandName === null) return 1;
    if (b.brandName === null) return -1;
    return a.brandName.localeCompare(b.brandName, "ja");
  }
  return a.productName.localeCompare(b.productName, "ja");
}

export class SupabaseProcurementQueueQueryService implements ProcurementQueueQueryService {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly findBrandNames: (
      productIds: string[]
    ) => Promise<Map<string, string>>
  ) {}

  // 対応待ちキューへの入場条件（docs/domain/procurement.md・settlement.md）: どの発注タスクにも入っておらず、
  // 注文がキャンセルされていない明細のうち、after_order は注文確定と同時に、at_order は決済単位が paid になってから入る。
  // PostgREST の or は埋め込んだ表（order_settlements）の列を条件に使えないため、支払いタイミングごとに取得して合わせる
  async findQueueItems({
    sort,
  }: {
    sort: ProcurementQueueSort;
  }): Promise<ProcurementQueueItemDto[]> {
    const [afterOrder, atOrder] = await Promise.all([
      this.findAfterOrderRows(),
      this.findPaidAtOrderRows(),
    ]);

    const rows = [...afterOrder, ...atOrder].sort(compareQueued);
    const brandNames = await this.findBrandNames([
      ...new Set(rows.map((row) => row.sanity_product_id)),
    ]);
    const items = rows.map(
      (row): ProcurementQueueItemDto => ({
        orderItemId: row.id,
        orderId: row.order_id,
        sanityProductId: row.sanity_product_id,
        productName: row.product_name_snapshot,
        brandName: brandNames.get(row.sanity_product_id) ?? null,
        quantity: row.quantity,
        orderedAt: new Date(row.orders.created_at).toISOString(),
        paymentTiming: row.payment_timing as PaymentTiming,
      })
    );
    // Array.prototype.sort は安定なので、同じ商品の中は対応待ちになった順のまま残る
    return sort === "product" ? items.sort(compareProduct) : items;
  }

  private async findAfterOrderRows(): Promise<QueueItemRow[]> {
    const { data, error } = await this.db
      .from("order_items")
      .select(QUEUE_ITEM_COLUMNS)
      .is("procurement_task_id", null)
      .neq("orders.status", "cancelled")
      .eq("payment_timing", "after_order")
      .returns<QueueItemRow[]>();
    if (error) throw error;
    return data;
  }

  private async findPaidAtOrderRows(): Promise<QueueItemRow[]> {
    const { data, error } = await this.db
      .from("order_items")
      .select(`${QUEUE_ITEM_COLUMNS}, order_settlements!inner(status)`)
      .is("procurement_task_id", null)
      .neq("orders.status", "cancelled")
      .eq("payment_timing", "at_order")
      .eq("order_settlements.status", "paid")
      .returns<QueueItemRow[]>();
    if (error) throw error;
    return data;
  }
}
