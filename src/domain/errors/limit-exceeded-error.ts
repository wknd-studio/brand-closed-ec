import { DomainError } from "./domain-error";

export class LimitExceededError extends DomainError {
  constructor(
    readonly attempted: number,
    readonly limit: number
  ) {
    super(`月次上限を超過しました。試行金額: ${attempted}円、上限: ${limit}円`);
  }
}
