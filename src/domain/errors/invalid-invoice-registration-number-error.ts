import { DomainError } from "./domain-error";

// FR-021: 適格請求書発行事業者登録番号は "T" + 数字13桁の形式でなければならない
export class InvalidInvoiceRegistrationNumberError extends DomainError {
  constructor(readonly value: string) {
    super(`不正な適格請求書発行事業者登録番号です: ${value}`);
  }
}
