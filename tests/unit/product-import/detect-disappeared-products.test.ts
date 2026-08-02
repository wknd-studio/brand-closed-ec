import { describe, it, expect } from "vitest";

import { detectDisappearedProducts } from "@/lib/product-import/detect-disappeared-products";
import type { ExistingProductRef } from "@/lib/product-import/dedupe";
import type { UnifiedProductRecord } from "@/lib/product-import/unified-product-schema";

function existing(
  overrides: Partial<ExistingProductRef> = {}
): ExistingProductRef {
  return {
    _id: "product-1",
    name: "商品A",
    brandName: "ブランドA",
    ...overrides,
  };
}

function record(
  overrides: Partial<UnifiedProductRecord> = {}
): UnifiedProductRecord {
  return {
    name: "商品A",
    brandName: "ブランドA",
    retailPrice: 1000,
    availability: "available",
    catalogId: "catalog-1",
    origin: { kind: "scraping", sourceUrl: "https://example.com" },
    ...overrides,
  };
}

describe("detectDisappearedProducts", () => {
  it("JANコードが一致する商品はスクレイプ結果に存在するとみなし消失扱いしない", () => {
    const result = detectDisappearedProducts(
      [existing({ janCode: "111" })],
      [record({ janCode: "111", name: "別の名前でもよい" })]
    );
    expect(result).toEqual([]);
  });

  it("JANコードが一致する商品がスクレイプ結果に無ければ消失として返す", () => {
    const existingProduct = existing({ janCode: "111" });
    const result = detectDisappearedProducts(
      [existingProduct],
      [record({ janCode: "222" })]
    );
    expect(result).toEqual([existingProduct]);
  });

  it("JANコードが無い商品は名前+ブランドの完全一致で存在を判定する", () => {
    const result = detectDisappearedProducts(
      [existing({ name: "商品A", brandName: "ブランドA" })],
      [record({ name: "商品A", brandName: "ブランドA" })]
    );
    expect(result).toEqual([]);
  });

  it("JANコードが無く名前+ブランドも一致しない商品は消失として返す", () => {
    const existingProduct = existing({ name: "商品A", brandName: "ブランドA" });
    const result = detectDisappearedProducts(
      [existingProduct],
      [record({ name: "商品B", brandName: "ブランドA" })]
    );
    expect(result).toEqual([existingProduct]);
  });

  it("スクレイプ結果が空なら既存商品は全て消失として返す", () => {
    const existingProduct = existing();
    const result = detectDisappearedProducts([existingProduct], []);
    expect(result).toEqual([existingProduct]);
  });
});
