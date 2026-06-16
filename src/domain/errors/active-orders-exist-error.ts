import { DomainError } from "./domain-error";

export class ActiveOrdersExistError extends DomainError {
  constructor() {
    super("進行中の注文があるため退会できません");
  }
}
