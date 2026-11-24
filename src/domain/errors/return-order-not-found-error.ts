import { DomainError } from "./domain-error";

/** 申請先の注文が無い、または他の会員の注文（存在を明かさないよう同じエラーにする） */
export class ReturnOrderNotFoundError extends DomainError {
  constructor(readonly orderId: string) {
    super("注文が見つかりません");
  }
}
