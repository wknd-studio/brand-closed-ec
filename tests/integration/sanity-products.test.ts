import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "next-sanity";
import {
  fetchBrands,
  fetchProducts,
  getAllowedRanks,
} from "@/lib/sanity/products";

const writeClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: "2026-05-17",
  useCdn: false,
  token: process.env.SANITY_WRITE_TOKEN,
});

const TEST_BRAND_ID = "test-catalog-brand-seven-rank";
const TEST_PRODUCT_STARTER_ID = "test-catalog-product-starter-seven-rank";
const TEST_PRODUCT_ADVANCED_ID = "test-catalog-product-advanced-seven-rank";

describe("7ランクでのカタログ取得（実Sanity）", () => {
  beforeAll(async () => {
    await writeClient.createOrReplace({
      _id: TEST_BRAND_ID,
      _type: "brand",
      name: "テストブランド（7ランク検証用）",
    });
    await writeClient.createOrReplace({
      _id: TEST_PRODUCT_STARTER_ID,
      _type: "product",
      name: "テスト商品（STARTER閲覧可）",
      brand: { _type: "reference", _ref: TEST_BRAND_ID },
      retail_price: 1000,
      is_negotiable: false,
      prices: { starter: 500 },
      min_rank: "starter",
      availability: "available",
    });
    await writeClient.createOrReplace({
      _id: TEST_PRODUCT_ADVANCED_ID,
      _type: "product",
      name: "テスト商品（ADVANCED以上限定）",
      brand: { _type: "reference", _ref: TEST_BRAND_ID },
      retail_price: 2000,
      is_negotiable: false,
      prices: { advanced: 1500 },
      min_rank: "advanced",
      availability: "available",
    });
  });

  afterAll(async () => {
    await writeClient.delete(TEST_PRODUCT_STARTER_ID);
    await writeClient.delete(TEST_PRODUCT_ADVANCED_ID);
    await writeClient.delete(TEST_BRAND_ID);
  });

  it("STARTERランクの会員はADVANCED限定商品を取得できない", async () => {
    const allowedRanks = getAllowedRanks("starter");
    const { products } = await fetchProducts({
      allowedRanks,
      brand: "テストブランド（7ランク検証用）",
    });
    const ids = products.map((p) => p._id);
    expect(ids).toContain(TEST_PRODUCT_STARTER_ID);
    expect(ids).not.toContain(TEST_PRODUCT_ADVANCED_ID);
  });

  it("ADVANCEDランクの会員は両方の商品を取得できる", async () => {
    const allowedRanks = getAllowedRanks("advanced");
    const { products } = await fetchProducts({
      allowedRanks,
      brand: "テストブランド（7ランク検証用）",
    });
    const ids = products.map((p) => p._id);
    expect(ids).toContain(TEST_PRODUCT_STARTER_ID);
    expect(ids).toContain(TEST_PRODUCT_ADVANCED_ID);
  });

  it("ブランド一覧はアクセス可能な商品を持つ会員のランクに応じて件数が変わる", async () => {
    const starterBrands = await fetchBrands(getAllowedRanks("starter"));
    const advancedBrands = await fetchBrands(getAllowedRanks("advanced"));

    const starterCount = starterBrands.find(
      (b) => b.brand === "テストブランド（7ランク検証用）"
    )?.count;
    const advancedCount = advancedBrands.find(
      (b) => b.brand === "テストブランド（7ランク検証用）"
    )?.count;

    expect(starterCount).toBe(1);
    expect(advancedCount).toBe(2);
  });
});
