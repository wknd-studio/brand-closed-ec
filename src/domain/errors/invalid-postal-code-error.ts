import { DomainError } from "./domain-error";

// 郵便番号は数字7桁（3桁目の後のハイフンは任意）でなければならない
export class InvalidPostalCodeError extends DomainError {
  constructor(readonly value: string) {
    super(`不正な郵便番号です: ${value}`);
  }
}
