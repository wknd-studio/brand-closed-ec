import { DomainError } from "./domain-error";

export class CheckoutSessionNotAttachableError extends DomainError {
  constructor(readonly settlementId: string) {
    super(
      `決済単位 ${settlementId} にはCheckout Sessionを紐付けられません（決済前のCheckoutで未紐付けのものだけ）`
    );
  }
}
