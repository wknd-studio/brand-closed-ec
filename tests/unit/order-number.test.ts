import { describe, it, expect, vi } from "vitest";
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

  describe("generate()", () => {
    it("乱数源に5バイト（40ビット）を求め、5ビットずつ8文字にする", () => {
      const randomBytes = vi.fn(
        // 0x00 0x44 0x32 0x14 0xC7 = 00000 00001 00010 00011 00100 00101 00110 00111
        () => new Uint8Array([0x00, 0x44, 0x32, 0x14, 0xc7])
      );

      expect(OrderNumber.generate(randomBytes).value).toBe("01234567");
      expect(randomBytes).toHaveBeenCalledWith(5);
    });

    it("すべて1のビットは Z（31）が8文字になる", () => {
      expect(
        OrderNumber.generate(
          () => new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])
        ).value
      ).toBe("ZZZZZZZZ");
    });

    it("作った番号は of() で受け付けられる形になる", () => {
      const number = OrderNumber.generate((length) =>
        crypto.getRandomValues(new Uint8Array(length))
      );

      expect(OrderNumber.of(number.value).equals(number)).toBe(true);
    });

    it.each([4, 6])(
      "乱数源が5バイト以外（%iバイト）を返したら作らない",
      (length) => {
        expect(() =>
          OrderNumber.generate(() => new Uint8Array(length))
        ).toThrow(RangeError);
      }
    );
  });

  describe("display()", () => {
    it("4文字ずつハイフンで区切った形を返す（保存する形は変えない）", () => {
      const number = OrderNumber.of("K7Q2M9XD");

      expect(number.display()).toBe("K7Q2-M9XD");
      expect(number.value).toBe("K7Q2M9XD");
    });
  });

  // 会員・運営者が書き写した番号（問い合わせ・管理画面の入力）の揺れを吸収する（#755）
  describe("parse()", () => {
    it.each([
      ["保存する形", "K7Q2M9XD"],
      ["表示の形（ハイフン付き）", "K7Q2-M9XD"],
      ["小文字", "k7q2-m9xd"],
      ["前後の空白", "  K7Q2-M9XD \n"],
      ["区切りの空白", "K7Q2 M9XD"],
      ["ハイフンの位置が違う", "K-7Q2M-9XD"],
    ])("%s を同じ番号として読む", (_, input) => {
      expect(OrderNumber.parse(input).equals(OrderNumber.of("K7Q2M9XD"))).toBe(
        true
      );
    });

    it.each([
      ["O を 0", "1O2O3O4O", "10203040"],
      ["小文字の o を 0", "1o2o3o4o", "10203040"],
      ["I を 1", "I0I0I0I0", "10101010"],
      ["L を 1", "L0L0L0L0", "10101010"],
      ["小文字の i・l を 1", "i0l0i0l0", "10101010"],
    ])("番号に使わない文字の読み違い（%s）を直して読む", (_, input, value) => {
      expect(OrderNumber.parse(input).value).toBe(value);
    });

    it.each([
      ["U（読み替える先が無い）", "K7Q2M9XU"],
      ["7文字", "K7Q2-M9X"],
      ["9文字", "K7Q2-M9XDA"],
      ["記号", "K7Q2_M9XD"],
      ["空文字", ""],
    ])("読み替えても番号の形にならない値（%s）は読めない", (_, input) => {
      expect(() => OrderNumber.parse(input)).toThrow(InvalidOrderNumberError);
    });

    it("読めなかったときのエラーは入力された値をそのまま持つ", () => {
      expect(() => OrderNumber.parse("k7q2-m9xu")).toThrow(
        expect.objectContaining({ value: "k7q2-m9xu" })
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
