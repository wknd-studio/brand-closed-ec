import { describe, it, expect } from "vitest";
import { validateAndPreview } from "@/lib/product-import/validate-and-preview";
import type { UnifiedProductRecord } from "@/lib/product-import/unified-product-schema";

function record(
  overrides: Partial<UnifiedProductRecord> = {},
  rowNumber = 1
): UnifiedProductRecord {
  return {
    name: "商品A",
    brandName: "ブランドA",
    retailPrice: 10000,
    availability: "available",
    catalogId: "catalog-a",
    origin: { kind: "csv", rowNumber },
    ...overrides,
  };
}

const knownBrandNames = ["ブランドA", "ブランドB"];

describe("validateAndPreview", () => {
  it("全行が正常なら outcome は ok で全件成功扱いになる", () => {
    const result = validateAndPreview(
      [record({}, 1), record({}, 2)],
      knownBrandNames
    );

    expect(result.outcome).toBe("ok");
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.validRecords).toHaveLength(2);
  });

  it("商品名が未入力の行はエラーとして扱う", () => {
    const result = validateAndPreview([record({ name: "" })], knownBrandNames);

    expect(result.errorCount).toBe(1);
    expect(result.validRecords).toHaveLength(0);
  });

  it("定価が0以下の行はエラーとして扱う", () => {
    const result = validateAndPreview(
      [record({ retailPrice: 0 })],
      knownBrandNames
    );

    expect(result.errorCount).toBe(1);
  });

  it("既存ブランドに存在しないブランド名の行はエラーとして扱う（Edge Cases: ブランド参照が解決できない）", () => {
    const result = validateAndPreview(
      [record({ brandName: "未登録ブランド" })],
      knownBrandNames
    );

    expect(result.errorCount).toBe(1);
    expect(result.errors[0].reason).toContain("ブランド");
  });

  it("バッチ内で同じJANコードが複数行にある場合、最後の行を有効としそれ以外はエラーにする", () => {
    // 重複エラー1件が閾値超過を引き起こさないよう、正常な行を混ぜて全体のエラー率を30%以下に保つ
    const records = [
      record({ janCode: "123", retailPrice: 1000 }, 1),
      record({ janCode: "123", retailPrice: 2000 }, 2),
      record({}, 3),
      record({}, 4),
    ];

    const result = validateAndPreview(records, knownBrandNames);

    expect(result.outcome).toBe("ok");
    expect(result.errorCount).toBe(1);
    expect(result.validRecords).toHaveLength(3);
    expect(
      result.validRecords.find((r) => r.janCode === "123")?.retailPrice
    ).toBe(2000);
  });

  it("エラー行の割合が閾値(30%)を超える場合、全体を中止し有効な行も反映しない（FR-020）", () => {
    const records = [
      record({ name: "" }, 1),
      record({ name: "" }, 2),
      record({ name: "" }, 3),
      record({}, 4),
    ];

    const result = validateAndPreview(records, knownBrandNames);

    expect(result.outcome).toBe("aborted_error_threshold");
    expect(result.validRecords).toHaveLength(0);
  });

  it("エラー行の割合が閾値以下であれば、エラー行を除いた正常な行のみ反映する", () => {
    const records = [
      record({ name: "" }, 1),
      record({}, 2),
      record({}, 3),
      record({}, 4),
    ];

    const result = validateAndPreview(records, knownBrandNames);

    expect(result.outcome).toBe("ok");
    expect(result.errorCount).toBe(1);
    expect(result.validRecords).toHaveLength(3);
  });

  it("csv-adapter等より前段のエラー(preExistingErrors)も分母に含めてエラー率を判定する", () => {
    // 正常な行は1件だが、CSVパース段階で3件が既にエラーになっている場合、
    // records.lengthだけで分母を計算すると見かけ上エラー率0%になってしまうため、
    // preExistingErrorsを分母・分子の両方に含めて正しく閾値判定する必要がある
    const preExistingErrors = [
      {
        origin: { kind: "csv" as const, rowNumber: 1 },
        reason: "ブランド列が読み取れません",
      },
      {
        origin: { kind: "csv" as const, rowNumber: 2 },
        reason: "定価が読み取れません",
      },
      {
        origin: { kind: "csv" as const, rowNumber: 3 },
        reason: "商品名が読み取れません",
      },
    ];

    const result = validateAndPreview(
      [record({}, 4)],
      knownBrandNames,
      preExistingErrors
    );

    expect(result.outcome).toBe("aborted_error_threshold");
    expect(result.errorCount).toBe(3);
    expect(result.validRecords).toHaveLength(0);
  });

  it("preExistingErrorsがあってもエラー率が閾値以下であれば通常通り反映する", () => {
    const preExistingErrors = [
      {
        origin: { kind: "csv" as const, rowNumber: 1 },
        reason: "商品名が読み取れません",
      },
    ];

    const result = validateAndPreview(
      [record({}, 2), record({}, 3), record({}, 4)],
      knownBrandNames,
      preExistingErrors
    );

    expect(result.outcome).toBe("ok");
    expect(result.errorCount).toBe(1);
    expect(result.validRecords).toHaveLength(3);
  });
});
