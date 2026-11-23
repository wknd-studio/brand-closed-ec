import { describe, it, expect } from "vitest";
import {
  DEFAULT_FULFILLMENT_LOCATION,
  FULFILLMENT_LOCATION_OPTIONS,
} from "@/sanity/schemas/fulfillment-location-options";
import { product } from "@/sanity/schemas/product";
import { SEED_PRODUCTS } from "../../../scripts/seed-products";

// 商品の発送拠点（#356）。値は DB の locations.code と一致させる
describe("発送拠点の選択肢", () => {
  it("事務所経由（office）と仕入れ先直送（supplier_direct）の2つ", () => {
    expect(FULFILLMENT_LOCATION_OPTIONS).toEqual([
      { title: "事務所経由", value: "office" },
      { title: "仕入れ先直送", value: "supplier_direct" },
    ]);
  });

  it("既定値は office", () => {
    expect(DEFAULT_FULFILLMENT_LOCATION).toBe("office");
  });
});

describe("商品の fulfillment_location フィールド", () => {
  const field = product.fields.find(
    (f) => (f as { name: string }).name === "fulfillment_location"
  ) as
    | {
        type: string;
        options?: { list?: unknown };
        initialValue?: unknown;
        validation?: (rule: unknown) => unknown;
      }
    | undefined;

  it("発送拠点の選択肢から選ぶ文字列の欄", () => {
    expect(field?.type).toBe("string");
    expect(field?.options?.list).toEqual(FULFILLMENT_LOCATION_OPTIONS);
  });

  it("新規作成時の初期値は office", () => {
    expect(field?.initialValue).toBe("office");
  });

  it("必須", () => {
    if (!field?.validation) {
      throw new Error("validation未設定: fulfillment_location");
    }
    let required = false;
    const rule = {
      required: () => {
        required = true;
        return rule;
      },
    };
    field.validation(rule);
    expect(required).toBe(true);
  });
});

describe("開発用 seed の発送拠点", () => {
  it("全商品に発送拠点の選択肢のどれかが入っている", () => {
    const values: string[] = FULFILLMENT_LOCATION_OPTIONS.map((o) => o.value);
    for (const p of SEED_PRODUCTS) {
      expect(values, p._id).toContain(p.fulfillment_location);
    }
  });

  it.each(FULFILLMENT_LOCATION_OPTIONS.map((o) => o.value))(
    "%s の商品がある",
    (value) => {
      expect(SEED_PRODUCTS.some((p) => p.fulfillment_location === value)).toBe(
        true
      );
    }
  );
});
