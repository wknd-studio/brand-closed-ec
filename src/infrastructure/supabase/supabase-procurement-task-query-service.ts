import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { OrderNumber } from "@/domain/value-objects/order-number";
import type {
  ProcurementTaskDetailDto,
  ProcurementTaskItemDto,
  ProcurementTaskListItemDto,
  ProcurementTaskProductTotalDto,
  ProcurementTaskQueryService,
  ProcurementTaskStatus,
  ProcurementTaskStatusFilter,
} from "@/queries/procurement-task-query-service";

type TaskListRow = {
  id: string;
  status: string;
  created_at: string;
  ordered_at: string | null;
  admin_users: { name: string } | null;
  order_items: { count: number }[];
};

type TaskItemRow = {
  id: string;
  order_id: string;
  sanity_product_id: string;
  product_name_snapshot: string;
  quantity: number;
  received_at: string | null;
  created_at: string;
  orders: { order_number: string; created_at: string };
  locations: { name: string };
};

type TaskDetailRow = Omit<TaskListRow, "order_items"> & {
  notes: string | null;
  order_items: TaskItemRow[];
};

const TASK_COLUMNS = "id, status, created_at, ordered_at, admin_users(name)";

// URL から来たタスクIDが UUID の形でないとき（invalid_text_representation）
function isInvalidUuid(error: PostgrestError): boolean {
  return error.code === "22P02";
}

function toIso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

// 注文日時の古い順。同じ注文の中は明細の作成順
function compareItems(a: TaskItemRow, b: TaskItemRow): number {
  return (
    Date.parse(a.orders.created_at) - Date.parse(b.orders.created_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

function sumByProduct(
  items: ProcurementTaskItemDto[]
): ProcurementTaskProductTotalDto[] {
  const totals = new Map<string, ProcurementTaskProductTotalDto>();
  for (const item of items) {
    const total = totals.get(item.sanityProductId);
    if (total) {
      total.totalQuantity += item.quantity;
    } else {
      totals.set(item.sanityProductId, {
        sanityProductId: item.sanityProductId,
        productName: item.productName,
        totalQuantity: item.quantity,
      });
    }
  }
  return [...totals.values()];
}

export class SupabaseProcurementTaskQueryService implements ProcurementTaskQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findTasks({
    status,
  }: {
    status: ProcurementTaskStatusFilter;
  }): Promise<ProcurementTaskListItemDto[]> {
    const query = this.db
      .from("procurement_tasks")
      .select(`${TASK_COLUMNS}, order_items(count)`)
      .order("created_at", { ascending: false });
    const { data, error } = await (
      status === "active"
        ? query.neq("status", "cancelled")
        : query.eq("status", status)
    ).returns<TaskListRow[]>();
    if (error) throw error;
    return data.map((row) => ({
      taskId: row.id,
      status: row.status as ProcurementTaskStatus,
      assigneeName: row.admin_users?.name ?? null,
      createdAt: toIso(row.created_at)!,
      orderedAt: toIso(row.ordered_at),
      itemCount: row.order_items[0]?.count ?? 0,
    }));
  }

  async findTaskDetail({
    taskId,
  }: {
    taskId: string;
  }): Promise<ProcurementTaskDetailDto | null> {
    const { data, error } = await this.db
      .from("procurement_tasks")
      .select(
        `${TASK_COLUMNS}, notes, order_items(id, order_id, sanity_product_id, product_name_snapshot, quantity, received_at, created_at, orders!inner(order_number, created_at), locations!inner(name))`
      )
      .eq("id", taskId)
      .maybeSingle<TaskDetailRow>();
    if (error) {
      if (isInvalidUuid(error)) return null;
      throw error;
    }
    if (!data) return null;

    const items = [...data.order_items].sort(compareItems).map(
      (row): ProcurementTaskItemDto => ({
        orderItemId: row.id,
        orderId: row.order_id,
        orderNumber: OrderNumber.of(row.orders.order_number).display(),
        sanityProductId: row.sanity_product_id,
        productName: row.product_name_snapshot,
        quantity: row.quantity,
        fulfillmentLocationName: row.locations.name,
        receivedAt: toIso(row.received_at),
      })
    );
    return {
      taskId: data.id,
      status: data.status as ProcurementTaskStatus,
      assigneeName: data.admin_users?.name ?? null,
      createdAt: toIso(data.created_at)!,
      orderedAt: toIso(data.ordered_at),
      notes: data.notes,
      items,
      productTotals: sumByProduct(items),
    };
  }
}
