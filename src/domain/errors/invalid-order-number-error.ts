import { DomainError } from "./domain-error";

// 注文番号は Crockford Base32 の8文字でなければならない（#754）
export class InvalidOrderNumberError extends DomainError {
  constructor(readonly value: string) {
    super(`不正な注文番号です: ${value}`);
  }
}
