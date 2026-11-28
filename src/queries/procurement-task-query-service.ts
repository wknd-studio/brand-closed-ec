// 発注タスクのステータス（docs/domain/procurement.md「タスクは4ステータス制」）
export type ProcurementTaskStatus =
  | "pending"
  | "claimed"
  | "ordered"
  | "cancelled";

// active: cancelled を除いた全件（一覧の既定。ordered のまま入荷待ちのタスクも追うため）
export type ProcurementTaskStatusFilter = "active" | ProcurementTaskStatus;

// 発注タスク一覧（/admin/procurement/tasks）の1行
export type ProcurementTaskListItemDto = {
  taskId: string;
  status: ProcurementTaskStatus;
  // admin_users.name。未着手で担当者がいなければ null
  assigneeName: string | null;
  // ISO 文字列
  createdAt: string;
  orderedAt: string | null;
  itemCount: number;
};

// 発注タスク詳細の明細の1行
export type ProcurementTaskItemDto = {
  orderItemId: string;
  orderId: string;
  // 表示の形（OrderNumber.display()。4文字ずつハイフン区切り）
  orderNumber: string;
  sanityProductId: string;
  productName: string;
  quantity: number;
  // locations.name（事務所・仕入れ先直送）
  fulfillmentLocationName: string;
  receivedAt: string | null;
};

// 商品ごとの合計必要数。タスクの明細の quantity を sanity_product_id ごとに都度合計する（キャッシュしない）
export type ProcurementTaskProductTotalDto = {
  sanityProductId: string;
  productName: string;
  totalQuantity: number;
};

// 発注タスク詳細（/admin/procurement/tasks/[id]）
export type ProcurementTaskDetailDto = {
  taskId: string;
  status: ProcurementTaskStatus;
  assigneeName: string | null;
  createdAt: string;
  orderedAt: string | null;
  notes: string | null;
  // 注文日時の古い順
  items: ProcurementTaskItemDto[];
  // 明細に最初に出てくる順
  productTotals: ProcurementTaskProductTotalDto[];
};

export interface ProcurementTaskQueryService {
  // 作成日時の新しい順
  findTasks(input: {
    status: ProcurementTaskStatusFilter;
  }): Promise<ProcurementTaskListItemDto[]>;
  // 存在しないタスク・UUID の形でないIDは null
  findTaskDetail(input: {
    taskId: string;
  }): Promise<ProcurementTaskDetailDto | null>;
}
