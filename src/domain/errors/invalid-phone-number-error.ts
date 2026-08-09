import { DomainError } from "./domain-error";

// FR-019: 電話番号は0始まりの10〜11桁の数字でなければならない
export class InvalidPhoneNumberError extends DomainError {
  constructor(readonly value: string) {
    super(`不正な電話番号です: ${value}`);
  }
}
