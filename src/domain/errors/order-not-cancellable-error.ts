import { DomainError } from "./domain-error";

/** 注文がキャンセルできない状態（キャンセル済み・支払い済みの決済単位がある等）でキャンセルを試みた */
export class OrderNotCancellableError extends DomainError {
  constructor(readonly orderId: string) {
    super("この注文はキャンセルできません");
  }
}
