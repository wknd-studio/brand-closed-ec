import { describe, it, expect } from "vitest";
import {
  resolveEffectiveRate,
  computeRankPrices,
  clampRate,
} from "@/sanity/schemas/product-price-calculator";

describe("resolveEffectiveRate", () => {
  it("商品ごとの上書きがあればそれを優先する", () => {
    expect(
      resolveEffectiveRate("starter", { starter: 90 }, { starter: 95 })
    ).toBe(90);
  });

  it("商品ごとの上書きがなければデフォルト掛け率を使う", () => {
    expect(resolveEffectiveRate("starter", {}, { starter: 95 })).toBe(95);
  });

  it("どちらも未設定ならundefinedを返す", () => {
    expect(resolveEffectiveRate("starter", {}, {})).toBeUndefined();
  });
});

describe("computeRankPrices", () => {
  it("定価×有効掛け率で各ランクの価格を四捨五入して算出する", () => {
    const result = computeRankPrices(
      10000,
      { starter: 90 },
      { starter: 95, basic: 92 }
    );

    expect(result.starter).toBe(9000);
    expect(result.basic).toBe(9200);
  });

  it("端数は四捨五入する", () => {
    const result = computeRankPrices(999, { starter: 33 }, {});

    expect(result.starter).toBe(Math.round(999 * 0.33));
  });

  it("定価が未設定の場合はどのランクも計算しない", () => {
    const result = computeRankPrices(undefined, { starter: 90 }, {});

    expect(result).toEqual({});
  });

  it("有効掛け率が存在しないランクは結果に含めない", () => {
    const result = computeRankPrices(10000, { starter: 90 }, {});

    expect(result.starter).toBe(9000);
    expect(result.basic).toBeUndefined();
    expect(Object.keys(result)).not.toContain("basic");
  });
});

describe("clampRate", () => {
  it("0〜100の範囲内の値はそのまま返す", () => {
    expect(clampRate(50)).toBe(50);
    expect(clampRate(0)).toBe(0);
    expect(clampRate(100)).toBe(100);
  });

  it("100を超える値は100に丸める", () => {
    expect(clampRate(150)).toBe(100);
  });

  it("0未満の値は0に丸める", () => {
    expect(clampRate(-10)).toBe(0);
  });

  it("undefinedはそのままundefinedを返す", () => {
    expect(clampRate(undefined)).toBeUndefined();
  });
});
