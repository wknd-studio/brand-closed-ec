import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/infrastructure/sanity/client", () => ({
  sanityClient: { fetch: fetchMock },
}));

const { findBrandNamesByProductIds } =
  await import("@/infrastructure/sanity/sanity-product-brand-lookup");

beforeEach(() => {
  fetchMock.mockReset();
});

describe("findBrandNamesByProductIds", () => {
  it("商品IDで絞り、商品IDからブランド名への対応を返す。ブランドが無い商品は含めない", async () => {
    fetchMock.mockResolvedValue([
      { _id: "prod-a", brand: "ブランドA" },
      { _id: "prod-b", brand: null },
    ]);

    const result = await findBrandNamesByProductIds(["prod-a", "prod-b"]);

    const [query, params] = fetchMock.mock.calls[0];
    expect(query).toContain('_type=="product"&&_id in $ids');
    expect(query).toContain('"brand":brand->name');
    expect(params).toEqual({ ids: ["prod-a", "prod-b"] });
    expect(result).toEqual(new Map([["prod-a", "ブランドA"]]));
  });

  it("商品IDが無ければ Sanity に問い合わせず空の対応を返す", async () => {
    const result = await findBrandNamesByProductIds([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual(new Map());
  });
});
