import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";

// FR-021: 適格請求書発行事業者登録番号は "T" + 数字13桁の形式でなければならない
const INVOICE_REGISTRATION_NUMBER_PATTERN = /^T\d{13}$/;

export class InvoiceRegistrationNumber {
  private constructor(readonly value: string) {}

  static of(rawValue: string): InvoiceRegistrationNumber {
    if (!INVOICE_REGISTRATION_NUMBER_PATTERN.test(rawValue)) {
      throw new InvalidInvoiceRegistrationNumberError(rawValue);
    }
    return new InvoiceRegistrationNumber(rawValue);
  }

  equals(other: InvoiceRegistrationNumber): boolean {
    return this.value === other.value;
  }
}
