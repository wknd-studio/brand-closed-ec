import { describe, it, expect, vi } from "vitest";

vi.mock("next-sanity", () => ({
  createClient: vi.fn(() => ({ fetch: vi.fn() })),
}));

import { buildFavoriteListItems } from "@/lib/favorites/build-list";

type FakeProduct = { _id: string; min_rank: string; name: string };

function makeProduct(
  overrides: Partial<FakeProduct> & { _id: string }
): FakeProduct {
  return { min_rank: "starter", name: overrides._id, ...overrides };
}

describe("buildFavoriteListItems", () => {
  it("お気に入り登録順（新しい順）を維持して商品データと結合する", () => {
    const products = [
      makeProduct({ _id: "a" }),
      makeProduct({ _id: "b" }),
      makeProduct({ _id: "c" }),
    ];

    const result = buildFavoriteListItems(["c", "a", "b"], products, "starter");

    expect(result.map((r) => r.product._id)).toEqual(["c", "a", "b"]);
  });

  it("会員ランクが商品のmin_rank未満の場合はisAccessible:falseになる", () => {
    const products = [makeProduct({ _id: "a", min_rank: "premium" })];

    const result = buildFavoriteListItems(["a"], products, "starter");

    expect(result[0].isAccessible).toBe(false);
  });

  it("会員ランクが商品のmin_rank以上の場合はisAccessible:trueになる", () => {
    const products = [makeProduct({ _id: "a", min_rank: "starter" })];

    const result = buildFavoriteListItems(["a"], products, "premium");

    expect(result[0].isAccessible).toBe(true);
  });

  it("Sanity側で削除済みの商品（productsに含まれないID）は結果から除外する", () => {
    const products = [makeProduct({ _id: "a" })];

    const result = buildFavoriteListItems(
      ["a", "deleted-id"],
      products,
      "starter"
    );

    expect(result.map((r) => r.product._id)).toEqual(["a"]);
  });
});
