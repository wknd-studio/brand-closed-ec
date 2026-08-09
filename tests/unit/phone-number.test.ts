import { describe, it, expect } from "vitest";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";

describe("PhoneNumber", () => {
  describe("of()", () => {
    it("携帯電話番号（11桁）を受け付ける", () => {
      expect(PhoneNumber.of("09012345678").value).toBe("09012345678");
    });

    it("固定電話番号（10桁）を受け付ける", () => {
      expect(PhoneNumber.of("0312345678").value).toBe("0312345678");
    });

    it("ハイフン区切りは正規化して受け付ける", () => {
      expect(PhoneNumber.of("090-1234-5678").value).toBe("09012345678");
    });

    it("0始まりでない場合はエラーになる", () => {
      expect(() => PhoneNumber.of("19012345678")).toThrow(
        InvalidPhoneNumberError
      );
    });

    it("桁数が足りない場合はエラーになる", () => {
      expect(() => PhoneNumber.of("090123")).toThrow(InvalidPhoneNumberError);
    });

    it("桁数が多すぎる場合はエラーになる", () => {
      expect(() => PhoneNumber.of("090123456789")).toThrow(
        InvalidPhoneNumberError
      );
    });

    it("数字以外の文字を含む場合はエラーになる", () => {
      expect(() => PhoneNumber.of("090-1234-abcd")).toThrow(
        InvalidPhoneNumberError
      );
    });

    it("空文字はエラーになる", () => {
      expect(() => PhoneNumber.of("")).toThrow(InvalidPhoneNumberError);
    });
  });

  describe("equals()", () => {
    it("同じ値のとき true", () => {
      expect(
        PhoneNumber.of("09012345678").equals(PhoneNumber.of("090-1234-5678"))
      ).toBe(true);
    });
  });
});
