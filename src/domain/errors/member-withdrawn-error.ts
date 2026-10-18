import { DomainError } from "./domain-error";

export class MemberWithdrawnError extends DomainError {
  constructor() {
    super("退会済みの会員です");
  }
}
