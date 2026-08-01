import { describe, it, expect } from "vitest";
import { product, validatePaymentTiming } from "@/sanity/schemas/product";

describe("validatePaymentTiming", () => {
  it("要相談商品でat_orderを設定するとNG", () => {
    const result = validatePaymentTiming("at_order", { is_negotiable: true });
    expect(result).not.toBe(true);
  });

  it("要相談商品でafter_orderはOK", () => {
    expect(validatePaymentTiming("after_order", { is_negotiable: true })).toBe(
      true
    );
  });

  it("固定価格商品でat_orderはOK", () => {
    expect(validatePaymentTiming("at_order", { is_negotiable: false })).toBe(
      true
    );
  });

  it("固定価格商品でafter_orderはOK", () => {
    expect(validatePaymentTiming("after_order", { is_negotiable: false })).toBe(
      true
    );
  });
});

describe("price_rates / prices フィールドの表示条件", () => {
  function getHidden(fieldName: string) {
    const field = product.fields.find(
      (f) => (f as { name: string }).name === fieldName
    ) as { hidden?: (context: { document?: unknown }) => boolean } | undefined;
    if (!field?.hidden) throw new Error(`hidden未設定: ${fieldName}`);
    return field.hidden;
  }

  it("price_ratesはis_negotiable=trueで非表示になる", () => {
    const hidden = getHidden("price_rates");
    expect(hidden({ document: { is_negotiable: true } })).toBe(true);
  });

  it("price_ratesはis_negotiable=falseで表示される", () => {
    const hidden = getHidden("price_rates");
    expect(hidden({ document: { is_negotiable: false } })).toBe(false);
  });

  it("pricesはis_negotiable=trueで非表示になる", () => {
    const hidden = getHidden("prices");
    expect(hidden({ document: { is_negotiable: true } })).toBe(true);
  });

  it("pricesはis_negotiable=falseで表示される", () => {
    const hidden = getHidden("prices");
    expect(hidden({ document: { is_negotiable: false } })).toBe(false);
  });
});
