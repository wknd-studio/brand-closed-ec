import { describe, it, expect } from "vitest";
import { product, validateIsNegotiable } from "@/sanity/schemas/product";

// 要相談商品は Ver1 では作成できない（docs/domain/catalog.md・#608）
describe("validateIsNegotiable", () => {
  it("要相談商品をONにすると保存できない", () => {
    expect(validateIsNegotiable(true)).toBe(
      "要相談商品は現在扱っていません。OFFにしてください"
    );
  });

  it("OFFなら保存できる", () => {
    expect(validateIsNegotiable(false)).toBe(true);
  });

  it("未設定なら保存できる", () => {
    expect(validateIsNegotiable(undefined)).toBe(true);
  });
});

describe("is_negotiable フィールドのバリデーション", () => {
  it("ONでの保存を validateIsNegotiable で拒否する", () => {
    const field = product.fields.find(
      (f) => (f as { name: string }).name === "is_negotiable"
    ) as { validation?: (rule: unknown) => unknown } | undefined;
    if (!field?.validation) throw new Error("validation未設定: is_negotiable");

    let customValidator: ((value: unknown) => unknown) | undefined;
    const rule = {
      custom: (fn: (value: unknown) => unknown) => {
        customValidator = fn;
        return rule;
      },
    };
    field.validation(rule);

    expect(customValidator?.(true)).toBe(validateIsNegotiable(true));
    expect(customValidator?.(false)).toBe(true);
  });
});

describe("is_negotiable フィールドの表示条件", () => {
  function getHidden() {
    const field = product.fields.find(
      (f) => (f as { name: string }).name === "is_negotiable"
    ) as { hidden?: (context: { value?: unknown }) => boolean } | undefined;
    if (!field?.hidden) throw new Error("hidden未設定: is_negotiable");
    return field.hidden;
  }

  it("OFFの商品では非表示にし、ONにできないようにする", () => {
    expect(getHidden()({ value: false })).toBe(true);
  });

  it("未設定の商品（新規作成時を含む）では非表示にする", () => {
    expect(getHidden()({ value: undefined })).toBe(true);
  });

  it("古いデータでONのまま残っている商品では表示し、OFFに戻せるようにする", () => {
    expect(getHidden()({ value: true })).toBe(false);
  });
});
