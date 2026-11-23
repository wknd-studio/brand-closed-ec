import { DomainError } from "./domain-error";

export class MinimumMembershipPeriodError extends DomainError {
  constructor(readonly withdrawableFrom: Date) {
    super("入会から6ヶ月間は退会できません");
  }
}
