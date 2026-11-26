import type { ReturnRequest } from "@/domain/entities/return-request";

export interface ReturnRepository {
  /** 注文の申請を状態に関わらずすべて取得する（明細ごとの返品数量の合計は ReturnRequest.request() が数える） */
  findByOrderId(orderId: string): Promise<ReturnRequest[]>;
  /**
   * 新しい申請（requested）を明細と一緒にまとめて保存する。1つでも保存できなければ、どの申請も
   * 保存しない（明細の保存だけが失敗したときは、明細の無い申請が残りうる）。会員のクライアントでは
   * RLS により、本人の注文への申請・その注文の明細だけが保存でき、それ以外は例外を投げる
   */
  saveAll(returnRequests: readonly ReturnRequest[]): Promise<void>;
}
