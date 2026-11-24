import { describe, it, expect } from "vitest";
import { OrderNumber } from "@/domain/value-objects/order-number";
import { InvalidOrderNumberError } from "@/domain/errors/invalid-order-number-error";

// 注文番号（#754）: Crockford Base32（0-9 と I・L・O・U を除く英大文字）の8文字。
// 連番にしないのは、番号の差から注文件数が会員に分かるため（#753）
describe("OrderNumber", () => {
  describe("of()", () => {
    it("Crockford Base32 の8文字を受け付ける", () => {
      expect(OrderNumber.of("K7Q2M9XD").value).toBe("K7Q2M9XD");
    });

    it.each([
      ["小文字", "k7q2m9xd"],
      ["I", "K7Q2M9XI"],
      ["L", "K7Q2M9XL"],
      ["O", "K7Q2M9XO"],
      ["U", "K7Q2M9XU"],
      ["ハイフン付き", "K7Q2-M9XD"],
      ["7文字", "K7Q2M9X"],
      ["9文字", "K7Q2M9XDA"],
      ["空文字", ""],
    ])("形の違う値（%s）からは作れない", (_, value) => {
      expect(() => OrderNumber.of(value)).toThrow(InvalidOrderNumberError);
    });
  });

  describe("fromRandomBytes()", () => {
    it("5バイト（40ビット）を5ビットずつ8文字にする", () => {
      // 0x00 0x44 0x32 0x14 0xC7 = 00000 00001 00010 00011 00100 00101 00110 00111
      expect(
        OrderNumber.fromRandomBytes(
          new Uint8Array([0x00, 0x44, 0x32, 0x14, 0xc7])
        ).value
      ).toBe("01234567");
    });

    it("すべて1のビットは Z（31）が8文字になる", () => {
      expect(
        OrderNumber.fromRandomBytes(
          new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])
        ).value
      ).toBe("ZZZZZZZZ");
    });

    it("作った番号は of() で受け付けられる形になる", () => {
      const bytes = new Uint8Array([0x9a, 0x3c, 0x5e, 0x71, 0x0f]);
      const number = OrderNumber.fromRandomBytes(bytes);

      expect(OrderNumber.of(number.value).equals(number)).toBe(true);
    });

    it.each([4, 6])("5バイト以外（%iバイト）からは作れない", (length) => {
      expect(() => OrderNumber.fromRandomBytes(new Uint8Array(length))).toThrow(
        RangeError
      );
    });
  });

  describe("equals()", () => {
    it("同じ値なら等しく、違う値なら等しくない", () => {
      const a = OrderNumber.of("K7Q2M9XD");

      expect(a.equals(OrderNumber.of("K7Q2M9XD"))).toBe(true);
      expect(a.equals(OrderNumber.of("K7Q2M9XE"))).toBe(false);
    });
  });
});
