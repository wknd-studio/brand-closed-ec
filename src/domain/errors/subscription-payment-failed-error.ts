import { DomainError } from "./domain-error";

export class SubscriptionPaymentFailedError extends DomainError {
  constructor() {
    super("月額費用の支払いに失敗しているため、新規の注文はできません");
  }
}
