import { describe, it, expect } from "vitest";
import { findMatchingProduct } from "@/lib/product-import/dedupe";
import type { ExistingProductRef } from "@/lib/product-import/dedupe";
import type { UnifiedProductRecord } from "@/lib/product-import/unified-product-schema";

function record(
  overrides: Partial<UnifiedProductRecord> = {}
): UnifiedProductRecord {
  return {
    name: "テスト商品",
    brandName: "テストブランド",
    retailPrice: 10000,
    availability: "available",
    catalogId: "catalog-a",
    origin: { kind: "csv", rowNumber: 1 },
    ...overrides,
  };
}

describe("findMatchingProduct", () => {
  it("JANコードが一致する既存商品があれば、それを更新対象として返す", () => {
    const existing: ExistingProductRef[] = [
      {
        _id: "prod-1",
        janCode: "4901234567894",
        name: "別の名前",
        brandName: "別ブランド",
      },
    ];

    const result = findMatchingProduct(
      record({ janCode: "4901234567894" }),
      existing
    );

    expect(result).toEqual({ matched: true, productId: "prod-1" });
  });

  it("JANコードを持つが一致する既存商品がなければ、名前が一致していても新規として扱う", () => {
    const existing: ExistingProductRef[] = [
      {
        _id: "prod-1",
        janCode: "0000000000000",
        name: "テスト商品",
        brandName: "テストブランド",
      },
    ];

    const result = findMatchingProduct(
      record({ janCode: "4901234567894" }),
      existing
    );

    expect(result).toEqual({ matched: false });
  });

  it("JANコードが無い場合、商品名とブランドの完全一致で既存商品を返す", () => {
    const existing: ExistingProductRef[] = [
      { _id: "prod-2", name: "テスト商品", brandName: "テストブランド" },
    ];

    const result = findMatchingProduct(record(), existing);

    expect(result).toEqual({ matched: true, productId: "prod-2" });
  });

  it("JANコードが無く、商品名かブランドのどちらかでも異なれば新規として扱う", () => {
    const existing: ExistingProductRef[] = [
      { _id: "prod-2", name: "テスト商品", brandName: "違うブランド" },
    ];

    const result = findMatchingProduct(record(), existing);

    expect(result).toEqual({ matched: false });
  });

  it("JANコードが無く、表記ゆれ（末尾スペース等）があれば新規として扱う（あいまい一致はしない。FR-005）", () => {
    const existing: ExistingProductRef[] = [
      { _id: "prod-2", name: "テスト商品 ", brandName: "テストブランド" },
    ];

    const result = findMatchingProduct(record(), existing);

    expect(result).toEqual({ matched: false });
  });

  it("既存商品が1件もなければ新規として扱う", () => {
    const result = findMatchingProduct(record(), []);

    expect(result).toEqual({ matched: false });
  });
});
