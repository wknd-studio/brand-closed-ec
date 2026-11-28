import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  ReturnRepository,
  ReturnReview,
} from "@/repositories/return-repository";
import {
  type ReturnRequest,
  type ReturnStatus,
  reconstituteReturnRequest,
} from "@/domain/entities/return-request";

// 会員のクライアントでも読めるカラムだけを指定する（admin_note 等の運営の内部情報はカラム単位の権限で読めない）
export const RETURN_COLUMNS =
  "id, order_id, status, requested_by_user_id, reason, approved_at, return_items(order_item_id, quantity)";

export type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  requested_by_user_id: string | null;
  reason: string;
  approved_at: string | null;
  return_items: { order_item_id: string; quantity: number }[];
};

export function toReturnRequest(row: ReturnRow): ReturnRequest {
  return reconstituteReturnRequest({
    id: row.id,
    orderId: row.order_id,
    status: row.status as ReturnStatus,
    requestedByUserId: row.requested_by_user_id,
    reason: row.reason,
    items: row.return_items.map((item) => ({
      orderItemId: item.order_item_id,
      quantity: item.quantity,
    })),
    approvedAt: row.approved_at ? new Date(row.approved_at) : null,
  });
}

// 画面から来た申請IDが UUID の形でないとき（invalid_text_representation）
function isInvalidUuid(error: PostgrestError): boolean {
  return error.code === "22P02";
}

export class SupabaseReturnRepository implements ReturnRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByOrderId(orderId: string): Promise<ReturnRequest[]> {
    const { data, error } = await this.db
      .from("returns")
      .select(RETURN_COLUMNS)
      .eq("order_id", orderId);
    if (error) throw new Error(`返品申請の取得に失敗: ${error.message}`);
    return data.map(toReturnRequest);
  }

  async saveAll(returnRequests: readonly ReturnRequest[]): Promise<void> {
    // 1回の INSERT は1つの文として実行され、1行でも RLS 等で拒否されればどの行も入らない
    const { error } = await this.db.from("returns").insert(
      returnRequests.map((r) => ({
        id: r.id,
        order_id: r.orderId,
        status: r.status,
        requested_by_user_id: r.requestedByUserId,
        reason: r.reason,
      }))
    );
    if (error) throw new Error(`返品申請の保存に失敗: ${error.message}`);

    // PostgREST では2つの表を1トランザクションで書けない。明細の保存に失敗すると明細の無い申請が残るが、
    // 会員は申請を消せない（DELETE の権限が無い）ため、運営者が管理画面で却下する
    const { error: itemsError } = await this.db.from("return_items").insert(
      returnRequests.flatMap((r) =>
        r.items.map((item) => ({
          return_id: r.id,
          order_item_id: item.orderItemId,
          quantity: item.quantity,
        }))
      )
    );
    if (itemsError) {
      throw new Error(`返品明細の保存に失敗: ${itemsError.message}`);
    }
  }

  async findById(returnId: string): Promise<ReturnRequest | null> {
    const { data, error } = await this.db
      .from("returns")
      .select(RETURN_COLUMNS)
      .eq("id", returnId)
      .maybeSingle();
    if (error) {
      if (isInvalidUuid(error)) return null;
      throw new Error(`返品申請の取得に失敗: ${error.message}`);
    }
    return data ? toReturnRequest(data) : null;
  }

  async saveReview(
    returnRequest: ReturnRequest,
    review: ReturnReview
  ): Promise<boolean> {
    // status='requested' を条件にして、読んだ後に顧客が取り消した申請を書き換えない
    const { data, error } = await this.db
      .from("returns")
      .update({
        status: returnRequest.status,
        approved_at: returnRequest.approvedAt?.toISOString() ?? null,
        reviewed_by_admin_user_id: review.adminUserId,
        admin_note: review.adminNote,
      })
      .eq("id", returnRequest.id)
      .eq("status", "requested")
      .select("id");
    if (error) throw new Error(`返品申請の確認の保存に失敗: ${error.message}`);
    return data.length > 0;
  }

  async updateAdminNote(
    returnId: string,
    adminNote: string | null
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from("returns")
      .update({ admin_note: adminNote })
      .eq("id", returnId)
      .select("id");
    if (error) {
      if (isInvalidUuid(error)) return false;
      throw new Error(`返品申請の運営メモの保存に失敗: ${error.message}`);
    }
    return data.length > 0;
  }
}
