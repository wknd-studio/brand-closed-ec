import type { ReturnRequest } from "@/domain/entities/return-request";

/** 運営者の確認（承認・却下）で、申請と一緒に記録するもの */
export type ReturnReview = {
  /** 確認した運営者の admin_users.id */
  adminUserId: string;
  /** 運営メモ（admin_note）。null ならメモを消す */
  adminNote: string | null;
};

export interface ReturnRepository {
  /** 注文の申請を状態に関わらずすべて取得する（明細ごとの返品数量の合計は ReturnRequest.request() が数える） */
  findByOrderId(orderId: string): Promise<ReturnRequest[]>;
  /**
   * 新しい申請（requested）を明細と一緒にまとめて保存する。1つでも保存できなければ、どの申請も
   * 保存しない（明細の保存だけが失敗したときは、明細の無い申請が残りうる）。会員のクライアントでは
   * RLS により、本人の注文への申請・その注文の明細だけが保存でき、それ以外は例外を投げる
   */
  saveAll(returnRequests: readonly ReturnRequest[]): Promise<void>;
  /** 申請を1件取得する。無ければ（IDが UUID の形でなければ）null */
  findById(returnId: string): Promise<ReturnRequest | null>;
  /**
   * 運営者が承認・却下した申請の状態・承認日時を、確認した運営者・運営メモと一緒に保存する。
   * DB上の申請がまだ requested のときだけ書き換え、書き換えたかを返す（読んでから保存するまでの
   * 間に顧客が取り消していれば false。取消済みの申請を承認しないため）
   */
  saveReview(
    returnRequest: ReturnRequest,
    review: ReturnReview
  ): Promise<boolean>;
  /** 運営メモ（admin_note）を状態に関わらず書き換え、申請があったかを返す。null ならメモを消す */
  updateAdminNote(returnId: string, adminNote: string | null): Promise<boolean>;
}
