import { DomainError } from "./domain-error";

export class OnboardingAlreadyCompletedError extends DomainError {
  constructor() {
    super("既に入会手続きが完了しています");
  }
}
