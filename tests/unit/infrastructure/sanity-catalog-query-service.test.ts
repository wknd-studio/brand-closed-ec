import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemberRank } from "@/domain/value-objects/member-rank";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/infrastructure/sanity/client", () => ({
  sanityClient: { fetch: fetchMock },
}));

const { SanityCatalogQueryService } =
  await import("@/infrastructure/sanity/sanity-catalog-query-service");

const service = new SanityCatalogQueryService();

function sanityProduct(overrides: Record<string, unknown> = {}) {
  return {
    _id: "prod-1",
    name: "商品A",
    brand: "ブランドA",
    retail_price: 10000,
    is_negotiable: false,
    prices: { starter: 8000, standard: 6000 },
    min_rank: "starter",
    availability: "available",
    thumbnail: "https://cdn.example/a.jpg",
    payment_timing: "at_order",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("SanityCatalogQueryService.findBrands", () => {
  it("会員ランクで閲覧できるランクと販売終了の除外で絞り、ブランドごとに件数と最初のサムネイルを返す", async () => {
    fetchMock.mockResolvedValue([
      { brand: "Bブランド", thumbnail: "b1.jpg" },
      { brand: "Aブランド", thumbnail: null },
      { brand: "Bブランド", thumbnail: "b2.jpg" },
    ]);

    const brands = await service.findBrands(MemberRank.of("basic"));

    const [query, params] = fetchMock.mock.calls[0];
    expect(query).toContain("min_rank in $allowedRanks");
    expect(query).toContain('availability!="discontinued"');
    expect(params).toEqual({ allowedRanks: ["starter", "basic"] });
    expect(brands).toEqual([
      { brand: "Aブランド", count: 1, thumbnail: null },
      { brand: "Bブランド", count: 2, thumbnail: "b1.jpg" },
    ]);
  });
});

describe("SanityCatalogQueryService.findProducts", () => {
  it("会員ランクで閲覧できるランクと販売終了の除外で絞り、ランクの価格を付けて返す", async () => {
    fetchMock
      .mockResolvedValueOnce([
        sanityProduct(),
        sanityProduct({ _id: "prod-2", is_negotiable: true, prices: null }),
      ])
      .mockResolvedValueOnce(2);

    const result = await service.findProducts({
      rank: MemberRank.of("standard"),
    });

    const [query, params] = fetchMock.mock.calls[0];
    expect(query).toContain("min_rank in $allowedRanks");
    expect(query).toContain('availability!="discontinued"');
    expect(params).toEqual({
      allowedRanks: ["starter", "basic", "standard"],
      start: 0,
      end: 11,
    });
    expect(result.total).toBe(2);
    expect(result.products).toEqual([
      {
        id: "prod-1",
        name: "商品A",
        brand: "ブランドA",
        retailPrice: 10000,
        isNegotiable: false,
        unitPrice: 6000,
        availability: "available",
        thumbnail: "https://cdn.example/a.jpg",
      },
      expect.objectContaining({
        id: "prod-2",
        isNegotiable: true,
        unitPrice: null,
      }),
    ]);
  });

  it("ブランド・キーワード・offset を条件に渡す", async () => {
    fetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce(0);

    await service.findProducts({
      rank: MemberRank.of("starter"),
      brand: "ブランドA",
      keyword: "バッグ",
      offset: 24,
    });

    const [query, params] = fetchMock.mock.calls[0];
    expect(query).toContain("brand->name==$brand");
    expect(query).toContain("name match $keyword");
    expect(params).toEqual({
      allowedRanks: ["starter"],
      brand: "ブランドA",
      keyword: "*バッグ*",
      start: 24,
      end: 35,
    });
    const [countQuery, countParams] = fetchMock.mock.calls[1];
    expect(countQuery).toMatch(/^count\(/);
    expect(countParams).toEqual({
      allowedRanks: ["starter"],
      brand: "ブランドA",
      keyword: "*バッグ*",
    });
  });
});

describe("SanityCatalogQueryService.findProductDetail", () => {
  const detail = {
    ...sanityProduct({ min_rank: "standard" }),
    categories: ["バッグ"],
    description: [{ _type: "block" }],
    images: ["a.jpg", "b.jpg"],
    files: [{ label: "仕様書", url: "spec.pdf" }],
  };

  it("閲覧できるランクの商品は、ランクの価格を付けて返す", async () => {
    fetchMock.mockResolvedValue(detail);

    const result = await service.findProductDetail({
      rank: MemberRank.of("standard"),
      productId: "prod-1",
    });

    expect(fetchMock.mock.calls[0][1]).toEqual({ id: "prod-1" });
    expect(result).toEqual({
      id: "prod-1",
      name: "商品A",
      brand: "ブランドA",
      categories: ["バッグ"],
      description: [{ _type: "block" }],
      retailPrice: 10000,
      isNegotiable: false,
      unitPrice: 6000,
      availability: "available",
      images: ["a.jpg", "b.jpg"],
      files: [{ label: "仕様書", url: "spec.pdf" }],
      paymentTiming: "at_order",
    });
  });

  it("会員ランクより上のランクの商品は null", async () => {
    fetchMock.mockResolvedValue(detail);

    const result = await service.findProductDetail({
      rank: MemberRank.of("basic"),
      productId: "prod-1",
    });

    expect(result).toBeNull();
  });

  it("存在しない商品は null", async () => {
    fetchMock.mockResolvedValue(null);

    const result = await service.findProductDetail({
      rank: MemberRank.of("enterprise"),
      productId: "missing",
    });

    expect(result).toBeNull();
  });

  it("未設定の項目は空の一覧にし、payment_timing 未設定の既存商品は注文時払いとして扱う", async () => {
    fetchMock.mockResolvedValue({
      ...detail,
      categories: null,
      images: [null, "a.jpg"],
      files: null,
      payment_timing: null,
    });

    const result = await service.findProductDetail({
      rank: MemberRank.of("standard"),
      productId: "prod-1",
    });

    expect(result).toMatchObject({
      categories: [],
      images: ["a.jpg"],
      files: [],
      paymentTiming: "at_order",
    });
  });
});

describe("SanityCatalogQueryService.findFavoriteProducts", () => {
  it("お気に入りの並び順（新しい順）を保ち、Sanity で削除済みの商品は除く", async () => {
    fetchMock.mockResolvedValue([
      sanityProduct({ _id: "a" }),
      sanityProduct({ _id: "c" }),
    ]);

    const result = await service.findFavoriteProducts({
      rank: MemberRank.of("starter"),
      productIds: ["c", "deleted", "a"],
    });

    expect(fetchMock.mock.calls[0][1]).toEqual({
      ids: ["c", "deleted", "a"],
    });
    expect(result.map((r) => r.product.id)).toEqual(["c", "a"]);
  });

  it("会員ランクより上のランクの商品は閲覧できないとし、価格を返さない", async () => {
    fetchMock.mockResolvedValue([
      sanityProduct({ _id: "a", min_rank: "premium" }),
      sanityProduct({ _id: "b", min_rank: "starter" }),
    ]);

    const result = await service.findFavoriteProducts({
      rank: MemberRank.of("standard"),
      productIds: ["a", "b"],
    });

    expect(result).toEqual([
      {
        product: expect.objectContaining({ id: "a", unitPrice: null }),
        isAccessible: false,
      },
      {
        product: expect.objectContaining({ id: "b", unitPrice: 6000 }),
        isAccessible: true,
      },
    ]);
  });

  it("お気に入りが無ければ Sanity に問い合わせない", async () => {
    const result = await service.findFavoriteProducts({
      rank: MemberRank.of("starter"),
      productIds: [],
    });

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SanityCatalogQueryService.findCheckoutProducts", () => {
  it("カートの商品の最新の名前・ランクの価格・在庫・支払いタイミングを返す", async () => {
    fetchMock.mockResolvedValue([
      sanityProduct(),
      sanityProduct({
        _id: "prod-2",
        is_negotiable: true,
        availability: "out_of_stock",
        thumbnail: null,
        payment_timing: null,
      }),
    ]);

    const result = await service.findCheckoutProducts({
      rank: MemberRank.of("starter"),
      productIds: ["prod-1", "prod-2"],
    });

    expect(fetchMock.mock.calls[0][1]).toEqual({ ids: ["prod-1", "prod-2"] });
    expect(result).toEqual([
      {
        id: "prod-1",
        name: "商品A",
        thumbnail: "https://cdn.example/a.jpg",
        unitPrice: 8000,
        isOutOfStock: false,
        paymentTiming: "at_order",
      },
      {
        id: "prod-2",
        name: "商品A",
        thumbnail: null,
        unitPrice: null,
        isOutOfStock: true,
        paymentTiming: "at_order",
      },
    ]);
  });

  it("カートが空なら Sanity に問い合わせない", async () => {
    const result = await service.findCheckoutProducts({
      rank: MemberRank.of("starter"),
      productIds: [],
    });

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
