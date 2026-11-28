import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ReturnStatus } from "@/domain/entities/return-request";
import { OrderNumber } from "@/domain/value-objects/order-number";
import type {
  AdminReturnDetailDto,
  AdminReturnQueryService,
  AdminReturnSubmissionDto,
  AdminReturnSummaryDto,
} from "@/queries/admin-return-query-service";

type ReturnItemRow = {
  order_item_id: string;
  quantity: number;
  order_items: { product_name_snapshot: string; quantity: number };
};

type SummaryRow = {
  id: string;
  status: string;
  return_items: ReturnItemRow[];
};

type ListRow = SummaryRow & {
  order_id: string;
  created_at: string;
  orders: { order_number: string };
  requester: { last_name: string | null; first_name: string | null } | null;
};

type DetailRow = ListRow & {
  reason: string;
  admin_note: string | null;
  approved_at: string | null;
  requester: {
    last_name: string | null;
    first_name: string | null;
    email: string;
  } | null;
  creator: { name: string } | null;
  reviewer: { name: string } | null;
};

const ITEM_COLUMNS =
  "return_items(order_item_id, quantity, order_items(product_name_snapshot, quantity))";
// returns から users・admin_users へは外部キーが複数あるため、どの列で結ぶかを名前で指定する
const REQUESTER = "requester:users!returns_requested_by_user_id_fkey";
const LIST_COLUMNS = `id, status, order_id, created_at, orders(order_number), ${REQUESTER}(last_name, first_name), ${ITEM_COLUMNS}`;
const DETAIL_COLUMNS = `id, status, order_id, created_at, reason, admin_note, approved_at, orders(order_number), ${REQUESTER}(last_name, first_name, email), creator:admin_users!returns_created_by_admin_user_id_fkey(name), reviewer:admin_users!returns_reviewed_by_admin_user_id_fkey(name), ${ITEM_COLUMNS}`;

// URL から来た申請IDが UUID の形でないとき（invalid_text_representation）
function isInvalidUuid(error: PostgrestError): boolean {
  return error.code === "22P02";
}

function fullName(user: {
  last_name: string | null;
  first_name: string | null;
}): string {
  return [user.last_name, user.first_name].filter(Boolean).join(" ");
}

function toSummary(row: SummaryRow): AdminReturnSummaryDto {
  return {
    id: row.id,
    status: row.status as ReturnStatus,
    items: row.return_items.map((item) => ({
      orderItemId: item.order_item_id,
      productName: item.order_items.product_name_snapshot,
      quantity: item.quantity,
      orderedQuantity: item.order_items.quantity,
    })),
  };
}

// 運営者の画面用のため service role のクライアントで使う（admin_note 等は会員のロールでは読めない）
export class SupabaseAdminReturnQueryService implements AdminReturnQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // 1回の取得は max_rows（supabase/config.toml の1000件）で切られるため、超えたときに新しい申請が残るよう、
  // クエリでも新しい順にする。同じ送信の申請は作成日時が同じため、まとまりの途中で切れることはありうる
  async findSubmissions({
    status,
  }: {
    status: ReturnStatus | null;
  }): Promise<AdminReturnSubmissionDto[]> {
    let query = this.db.from("returns").select(LIST_COLUMNS);
    if (status) query = query.eq("status", status);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id")
      .returns<ListRow[]>();
    if (error) throw new Error(`返品申請の一覧の取得に失敗: ${error.message}`);

    // 新しい順に並んだ行を、出てきた順のまま、注文と作成日時の組ごとにまとめる
    const submissions = new Map<string, AdminReturnSubmissionDto>();
    for (const row of data) {
      const key = `${row.order_id}|${row.created_at}`;
      const submission = submissions.get(key) ?? {
        orderId: row.order_id,
        orderNumber: OrderNumber.of(row.orders.order_number).display(),
        createdAt: row.created_at,
        requesterName: row.requester ? fullName(row.requester) : null,
        returns: [],
      };
      submission.returns.push(toSummary(row));
      submissions.set(key, submission);
    }
    return [...submissions.values()];
  }

  async findDetail(returnId: string): Promise<AdminReturnDetailDto | null> {
    const { data, error } = await this.db
      .from("returns")
      .select(DETAIL_COLUMNS)
      .eq("id", returnId)
      .returns<DetailRow[]>()
      .maybeSingle();
    if (error) {
      if (isInvalidUuid(error)) return null;
      throw new Error(`返品申請の取得に失敗: ${error.message}`);
    }
    if (!data) return null;

    // 同じ送信のほかの申請（同じ注文・同じ作成日時）
    const { data: siblings, error: siblingsError } = await this.db
      .from("returns")
      .select(`id, status, ${ITEM_COLUMNS}`)
      .eq("order_id", data.order_id)
      .eq("created_at", data.created_at)
      .neq("id", data.id)
      .order("id")
      .returns<SummaryRow[]>();
    if (siblingsError) {
      throw new Error(
        `同じ送信の返品申請の取得に失敗: ${siblingsError.message}`
      );
    }

    return {
      ...toSummary(data),
      orderId: data.order_id,
      orderNumber: OrderNumber.of(data.orders.order_number).display(),
      createdAt: data.created_at,
      reason: data.reason,
      adminNote: data.admin_note,
      requester: data.requester
        ? { name: fullName(data.requester), email: data.requester.email }
        : null,
      createdByAdminName: data.creator?.name ?? null,
      reviewedByAdminName: data.reviewer?.name ?? null,
      approvedAt: data.approved_at,
      siblings: siblings.map(toSummary),
    };
  }
}
