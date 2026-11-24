import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ReturnRepository } from "@/repositories/return-repository";
import {
  type ReturnRequest,
  type ReturnStatus,
  reconstituteReturnRequest,
} from "@/domain/entities/return-request";

// 会員のクライアントでも読めるカラムだけを指定する（admin_note 等の運営の内部情報はカラム単位の権限で読めない）
export const RETURN_COLUMNS =
  "id, order_id, status, requested_by_user_id, reason, return_items(order_item_id, quantity)";

export type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  requested_by_user_id: string | null;
  reason: string;
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
  });
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

  async save(returnRequest: ReturnRequest): Promise<void> {
    const { error } = await this.db.from("returns").insert({
      id: returnRequest.id,
      order_id: returnRequest.orderId,
      status: returnRequest.status,
      requested_by_user_id: returnRequest.requestedByUserId,
      reason: returnRequest.reason,
    });
    if (error) throw new Error(`返品申請の保存に失敗: ${error.message}`);

    // PostgREST では2つの表を1トランザクションで書けない。明細の保存に失敗すると明細の無い申請が残るが、
    // 会員は申請を消せない（DELETE の権限が無い）ため、運営者が管理画面で却下する
    const { error: itemsError } = await this.db.from("return_items").insert(
      returnRequest.items.map((item) => ({
        return_id: returnRequest.id,
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      }))
    );
    if (itemsError) {
      throw new Error(`返品明細の保存に失敗: ${itemsError.message}`);
    }
  }
}
