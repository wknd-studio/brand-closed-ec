import { DomainError } from "./domain-error";

/**
 * 返品申請を読んでから保存するまでの間に、別の書き手（顧客の取消・別の運営者の確認等）が
 * その申請の状態を変えていたため、保存しなかった（status='requested' を条件にした更新。#383）
 */
export class ReturnConcurrentlyModifiedError extends DomainError {
  constructor(readonly returnId: string) {
    super(
      "この申請は他の操作で更新されました。画面を読み込み直してから、もう一度お試しください"
    );
  }
}
