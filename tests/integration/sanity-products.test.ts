import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "next-sanity";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { SanityCatalogQueryService } from "@/infrastructure/sanity/sanity-catalog-query-service";

const writeClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: "2026-05-17",
  useCdn: false,
  token: process.env.SANITY_WRITE_TOKEN,
});

const service = new SanityCatalogQueryService();

const TEST_BRAND_NAME = "テストブランド（7ランク検証用）";
const TEST_BRAND_ID = "test-catalog-brand-seven-rank";
const TEST_PRODUCT_STARTER_ID = "test-catalog-product-starter-seven-rank";
const TEST_PRODUCT_ADVANCED_ID = "test-catalog-product-advanced-seven-rank";
const TEST_PRODUCT_DISCONTINUED_ID =
  "test-catalog-product-discontinued-seven-rank";

// 共有の外部Sanityデータセットにテスト用ドキュメントを書き込むため、CIや並列開発中の
// 他セッションと同時に実行すると互いのデータを上書き・削除しうる。
// RUN_SANITY_INTEGRATION=true を指定したときだけ実行する（専用データセット化は別途検討）
const describeWithSanity = describe.skipIf(
  process.env.RUN_SANITY_INTEGRATION !== "true"
);

describeWithSanity("7ランクでのカタログ取得（実Sanity）", () => {
  beforeAll(async () => {
    await writeClient.createOrReplace({
      _id: TEST_BRAND_ID,
      _type: "brand",
      name: TEST_BRAND_NAME,
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
    await writeClient.createOrReplace({
      _id: TEST_PRODUCT_DISCONTINUED_ID,
      _type: "product",
      name: "テスト商品（販売終了）",
      brand: { _type: "reference", _ref: TEST_BRAND_ID },
      retail_price: 3000,
      is_negotiable: false,
      prices: { starter: 2500 },
      min_rank: "starter",
      availability: "discontinued",
    });
  });

  afterAll(async () => {
    await writeClient.delete(TEST_PRODUCT_STARTER_ID);
    await writeClient.delete(TEST_PRODUCT_ADVANCED_ID);
    await writeClient.delete(TEST_PRODUCT_DISCONTINUED_ID);
    await writeClient.delete(TEST_BRAND_ID);
  });

  it("STARTERランクの会員はADVANCED限定商品を取得できない", async () => {
    const { products } = await service.findProducts({
      rank: MemberRank.of("starter"),
      brand: TEST_BRAND_NAME,
    });
    const ids = products.map((p) => p.id);
    expect(ids).toContain(TEST_PRODUCT_STARTER_ID);
    expect(ids).not.toContain(TEST_PRODUCT_ADVANCED_ID);
  });

  it("ADVANCEDランクの会員は両方の商品を取得でき、ランクの価格が付く", async () => {
    const { products } = await service.findProducts({
      rank: MemberRank.of("advanced"),
      brand: TEST_BRAND_NAME,
    });
    const ids = products.map((p) => p.id);
    expect(ids).toContain(TEST_PRODUCT_STARTER_ID);
    expect(ids).toContain(TEST_PRODUCT_ADVANCED_ID);
    expect(
      products.find((p) => p.id === TEST_PRODUCT_ADVANCED_ID)?.unitPrice
    ).toBe(1500);
  });

  it("販売終了の商品は一覧に含まれない", async () => {
    const { products, total } = await service.findProducts({
      rank: MemberRank.of("enterprise"),
      brand: TEST_BRAND_NAME,
    });
    expect(products.map((p) => p.id)).not.toContain(
      TEST_PRODUCT_DISCONTINUED_ID
    );
    expect(total).toBe(2);
  });

  it("ブランド一覧はアクセス可能な商品を持つ会員のランクに応じて件数が変わり、販売終了の商品は数えない", async () => {
    const starterBrands = await service.findBrands(MemberRank.of("starter"));
    const advancedBrands = await service.findBrands(MemberRank.of("advanced"));

    const starterCount = starterBrands.find(
      (b) => b.brand === TEST_BRAND_NAME
    )?.count;
    const advancedCount = advancedBrands.find(
      (b) => b.brand === TEST_BRAND_NAME
    )?.count;

    expect(starterCount).toBe(1);
    expect(advancedCount).toBe(2);
  });

  it("商品名のキーワードで検索できる", async () => {
    const { products } = await service.findProducts({
      rank: MemberRank.of("starter"),
      keyword: "STARTER閲覧可",
    });
    expect(products.map((p) => p.id)).toContain(TEST_PRODUCT_STARTER_ID);
  });

  it("ブランド名のキーワードで検索できる", async () => {
    const { products } = await service.findProducts({
      rank: MemberRank.of("starter"),
      keyword: "7ランク検証用",
    });
    expect(products.map((p) => p.id)).toContain(TEST_PRODUCT_STARTER_ID);
  });

  it("キーワード検索でもランク制限を超える商品・販売終了の商品は含まれない", async () => {
    const { products } = await service.findProducts({
      rank: MemberRank.of("starter"),
      keyword: "テスト商品",
    });
    const ids = products.map((p) => p.id);
    expect(ids).toContain(TEST_PRODUCT_STARTER_ID);
    expect(ids).not.toContain(TEST_PRODUCT_ADVANCED_ID);
    expect(ids).not.toContain(TEST_PRODUCT_DISCONTINUED_ID);
  });

  it("商品詳細は会員ランクより上のランクの商品を返さない", async () => {
    expect(
      await service.findProductDetail({
        rank: MemberRank.of("starter"),
        productId: TEST_PRODUCT_ADVANCED_ID,
      })
    ).toBeNull();
    expect(
      await service.findProductDetail({
        rank: MemberRank.of("advanced"),
        productId: TEST_PRODUCT_ADVANCED_ID,
      })
    ).toMatchObject({ id: TEST_PRODUCT_ADVANCED_ID, unitPrice: 1500 });
  });
});
