import { describe, it, expect, vi } from "vitest";
import { applyImport } from "@/lib/product-import/apply-import";
import type { UnifiedProductRecord } from "@/lib/product-import/unified-product-schema";

const FULL_DEFAULT_RATES = {
  starter: 60,
  basic: 55,
  standard: 50,
  pro: 45,
  advanced: 40,
  premium: 35,
};

function record(
  overrides: Partial<UnifiedProductRecord> = {}
): UnifiedProductRecord {
  return {
    name: "商品A",
    brandName: "ブランドA",
    retailPrice: 10000,
    availability: "available",
    catalogId: "catalog-1",
    origin: { kind: "csv", rowNumber: 1 },
    ...overrides,
  };
}

function createFakeClient({
  existingProducts = [] as {
    _id: string;
    janCode?: string;
    name: string;
    brandName: string;
    prices?: Record<string, number>;
  }[],
  brands = [
    { _id: "brand-1", name: "ブランドA", priceSettingsRef: undefined },
  ] as { _id: string; name: string; priceSettingsRef?: string }[],
  priceSettingsDocs = [
    { _id: "ps-default", is_default: true, default_rates: FULL_DEFAULT_RATES },
  ] as { _id: string; is_default?: boolean; default_rates?: object }[],
} = {}) {
  const created: Record<string, unknown>[] = [];
  const patched: { id: string; doc: Record<string, unknown> }[] = [];

  const fetch = vi.fn((query: string) => {
    if (query.includes('_type == "product"'))
      return Promise.resolve(existingProducts);
    if (query.includes('_type == "brand"')) return Promise.resolve(brands);
    if (query.includes('_type == "priceSettings"'))
      return Promise.resolve(priceSettingsDocs);
    return Promise.resolve([]);
  });

  const create = vi.fn((doc: Record<string, unknown>) => {
    const withId = { ...doc, _id: `generated-${created.length}` };
    created.push(withId);
    return Promise.resolve(withId);
  });

  const patch = vi.fn((id: string) => ({
    set: (doc: Record<string, unknown>) => ({
      commit: () => {
        patched.push({ id, doc });
        return Promise.resolve({ _id: id, ...doc });
      },
    }),
  }));

  return {
    client: {
      fetch,
      create,
      patch,
    } as unknown as import("@sanity/client").SanityClient,
    created,
    patched,
  };
}

describe("applyImport", () => {
  it("新規商品を作成し、ランク価格はブランド/デフォルト掛け率から計算される", async () => {
    const { client, created } = createFakeClient();

    const result = await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date("2026-08-01T00:00:00Z"),
      outcome: "completed",
      validRecords: [record()],
      failureCount: 0,
    });

    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    const productDoc = created.find((d) => d._type === "product") as {
      prices: Record<string, number>;
      brand: { _ref: string };
    };
    expect(productDoc.prices.starter).toBe(6000);
    expect(productDoc.brand._ref).toBe("brand-1");
  });

  it("インポートで作成した商品は支払いタイミングを先払い(at_order)で初期設定する", async () => {
    // schemaのinitialValueはStudioのフォーム入力時のみ適用され、client.create()による
    // API経由の書き込みには効かないため、ここで明示的に設定しないと全件が
    // 支払いタイミング未設定になり、インポート後に商品ごとの手動設定が必要になってしまう
    const { client, created } = createFakeClient();

    await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: [record()],
      failureCount: 0,
    });

    const productDoc = created.find((d) => d._type === "product") as {
      payment_timing: string;
    };
    expect(productDoc.payment_timing).toBe("at_order");
  });

  it("既存商品とJANコードが一致すれば新規作成せず更新する", async () => {
    const { client, patched, created } = createFakeClient({
      existingProducts: [
        {
          _id: "prod-1",
          janCode: "999",
          name: "旧名称",
          brandName: "ブランドA",
          prices: FULL_DEFAULT_RATES,
        },
      ],
    });

    const result = await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: [record({ janCode: "999" })],
      failureCount: 0,
    });

    expect(result.updatedCount).toBe(1);
    expect(patched).toHaveLength(1);
    expect(patched[0].id).toBe("prod-1");
    expect(patched[0].doc.name).toBe("商品A");
    expect(created.find((d) => d._type === "product")).toBeUndefined();
  });

  it("更新時は支払いタイミング・ランク別仕入れ価格・最低閲覧ランクを上書きしない", async () => {
    // 運営者が商品ごとに手動調整した値（後払い設定・個別price_rates由来のprices・
    // 絞り込みランク）が、同じCSVの再インポートのたびに消えてしまう問題への対応。
    // 「新規作成時だけデフォルト値を設定し、更新時は既存値を尊重する」方針（ユーザーとの合意）
    const { client, patched } = createFakeClient({
      existingProducts: [
        {
          _id: "prod-1",
          janCode: "999",
          name: "旧名称",
          brandName: "ブランドA",
          prices: FULL_DEFAULT_RATES,
        },
      ],
    });

    await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: [record({ janCode: "999" })],
      failureCount: 0,
    });

    expect(patched).toHaveLength(1);
    expect(patched[0].doc).not.toHaveProperty("payment_timing");
    expect(patched[0].doc).not.toHaveProperty("prices");
    expect(patched[0].doc).not.toHaveProperty("min_rank");
    // 一方、業者データ由来のフィールドは引き続き更新される
    expect(patched[0].doc).toHaveProperty("retail_price", 10000);
    expect(patched[0].doc).toHaveProperty("availability", "available");
  });

  it("更新時の原価割れチェックは、再計算した価格ではなく既存の保存済み価格を基準にする", async () => {
    // 既存商品のprices(starterランク=6000円)に対し、再インポートで仕入れ掛け率が
    // 70%に変わった場合、仕入れ値は10000*0.7=7000円となりstarterの6000円を上回るため
    // 原価割れとして書き込みをブロックする。prices自体は更新時に触らないため、
    // チェックの基準は「既存の保存済みprices」でなければならない
    const { client, created } = createFakeClient({
      existingProducts: [
        {
          _id: "prod-1",
          janCode: "999",
          name: "旧名称",
          brandName: "ブランドA",
          prices: FULL_DEFAULT_RATES,
        },
      ],
    });

    const result = await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: [record({ janCode: "999", vendorCostRate: 70 })],
      failureCount: 0,
    });

    expect(result.updatedCount).toBe(0);
    const importRun = created.find((d) => d._type === "productImportRun") as {
      failure_count: number;
      error_details: { reason: string }[];
    };
    expect(importRun.failure_count).toBe(1);
    expect(importRun.error_details[0].reason).toContain("仕入れ掛け率");
  });

  it("仕入れ掛け率を下回るランクがある場合、商品を書き込まずエラーとして記録する", async () => {
    // デフォルト掛け率は最大60%(starter)だが、仕入れ掛け率70%だと全ランクが原価割れになる
    const { client, created } = createFakeClient();

    const result = await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: [record({ vendorCostRate: 70 })],
      failureCount: 0,
    });

    expect(result.createdCount).toBe(0);
    expect(created.find((d) => d._type === "product")).toBeUndefined();

    const importRun = created.find((d) => d._type === "productImportRun") as {
      failure_count: number;
      error_details: { reason: string }[];
    };
    expect(importRun.failure_count).toBe(1);
    expect(importRun.error_details[0].reason).toContain("仕入れ掛け率");
  });

  it("仕入れ掛け率が設定されていない商品は下限チェックの対象外", async () => {
    const { client, created } = createFakeClient();

    const result = await applyImport({
      client,
      catalogId: "catalog-1",
      triggeredBy: "manual_csv",
      startedAt: new Date(),
      outcome: "completed",
      validRecords: [record({ vendorCostRate: undefined })],
      failureCount: 0,
    });

    expect(result.createdCount).toBe(1);
    const importRun = created.find((d) => d._type === "productImportRun") as {
      failure_count: number;
    };
    expect(importRun.failure_count).toBe(0);
  });
});
