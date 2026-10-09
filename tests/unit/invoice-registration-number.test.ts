import { describe, it, expect } from "vitest";
import { InvoiceRegistrationNumber } from "@/domain/value-objects/invoice-registration-number";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";

describe("InvoiceRegistrationNumber", () => {
  describe("of()", () => {
    it("Tに続く数字13桁を受け付ける", () => {
      expect(InvoiceRegistrationNumber.of("T1234567890123").value).toBe(
        "T1234567890123"
      );
    });

    it("Tで始まらない場合はエラーになる", () => {
      expect(() => InvoiceRegistrationNumber.of("A1234567890123")).toThrow(
        InvalidInvoiceRegistrationNumberError
      );
    });

    it("桁数が足りない場合はエラーになる", () => {
      expect(() => InvoiceRegistrationNumber.of("T123")).toThrow(
        InvalidInvoiceRegistrationNumberError
      );
    });

    it("空文字はエラーになる", () => {
      expect(() => InvoiceRegistrationNumber.of("")).toThrow(
        InvalidInvoiceRegistrationNumberError
      );
    });
  });

  describe("equals()", () => {
    it("同じ値のとき true", () => {
      expect(
        InvoiceRegistrationNumber.of("T1234567890123").equals(
          InvoiceRegistrationNumber.of("T1234567890123")
        )
      ).toBe(true);
    });
  });
});
