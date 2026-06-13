import { DomainError } from "./domain-error";

export class InvalidStatusTransitionError extends DomainError {
  constructor(
    readonly from: string,
    readonly to: string
  ) {
    super(`無効なステータス遷移: ${from} → ${to}`);
  }
}
