import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemberRank } from "@/domain/value-objects/member-rank";

const { findMemberRank, findProducts, requireAuth } = vi.hoisted(() => ({
  findMemberRank: vi.fn(),
  findProducts: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/composition/member-query", () => ({
  memberQueryService: vi.fn(async () => ({ findMemberRank })),
}));

vi.mock("@/composition/catalog-query", () => ({
  catalogQueryService: vi.fn(() => ({ findProducts })),
}));

vi.mock("@/lib/auth/current-user", () => ({ requireAuth }));

import { findShopMemberRank } from "@/app/(member)/shop/member-rank";
import { fetchMoreProducts } from "@/app/(member)/shop/[brand]/actions";

beforeEach(() => {
  vi.clearAllMocks();
  findProducts.mockResolvedValue({ products: [], total: 0 });
});

describe("findShopMemberRank（商品画面の会員のランク）", () => {
  it("会員のランクを返す", async () => {
    findMemberRank.mockResolvedValue(MemberRank.of("advanced"));

    const rank = await findShopMemberRank("clerk_user");

    expect(rank.value).toBe("advanced");
    expect(findMemberRank).toHaveBeenCalledWith("clerk_user");
  });

  it("会員が見つからないときは、starter の価格で見せずにエラーにする", async () => {
    findMemberRank.mockResolvedValue(null);

    await expect(findShopMemberRank("clerk_user")).rejects.toThrow();
  });
});

describe("fetchMoreProducts（商品一覧の続きの読み込み）", () => {
  it("会員のランクで商品を読み込む", async () => {
    requireAuth.mockResolvedValue({ userId: "clerk_user" });
    findMemberRank.mockResolvedValue(MemberRank.of("basic"));

    await fetchMoreProducts(20, { brand: "BrandA" });

    expect(findProducts).toHaveBeenCalledWith({
      rank: MemberRank.of("basic"),
      offset: 20,
      brand: "BrandA",
    });
  });

  it("会員が見つからないときは、商品を返さずにエラーにする", async () => {
    requireAuth.mockResolvedValue({ userId: "clerk_user" });
    findMemberRank.mockResolvedValue(null);

    await expect(fetchMoreProducts(20, { brand: "BrandA" })).rejects.toThrow();
    expect(findProducts).not.toHaveBeenCalled();
  });

  it("未ログインのときは空の一覧を返す", async () => {
    requireAuth.mockResolvedValue({ userId: null });

    expect(await fetchMoreProducts(20, { brand: "BrandA" })).toEqual([]);
    expect(findProducts).not.toHaveBeenCalled();
  });
});
