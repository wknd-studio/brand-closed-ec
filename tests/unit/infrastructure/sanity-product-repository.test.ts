import { describe, it, expect, vi } from "vitest";
import { ProductPriceNotSetError } from "@/domain/errors/product-price-not-set-error";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/lib/sanity/client", () => ({
  sanityClient: { fetch: fetchMock },
}));

const { SanityProductRepository } =
  await import("@/infrastructure/sanity/sanity-product-repository");

describe("SanityProductRepository", () => {
  it("固定価格商品はランクに対応する仕入れ価格を返す", async () => {
    fetchMock.mockResolvedValue([
      {
        _id: "prod-1",
        name: "商品A",
        is_negotiable: false,
        prices: { standard: 5000 },
        min_rank: "starter",
        payment_timing: "at_order",
      },
    ]);

    const repo = new SanityProductRepository();
    const result = await repo.findByIds(["prod-1"], "standard");

    expect(result[0].unitPrice.amount).toBe(5000);
    expect(result[0].paymentTiming).toBe("at_order");
  });

  it("交渉商品は価格未設定でも0円として扱う", async () => {
    fetchMock.mockResolvedValue([
      {
        _id: "prod-2",
        name: "交渉商品",
        is_negotiable: true,
        prices: null,
        min_rank: "starter",
        payment_timing: "after_order",
      },
    ]);

    const repo = new SanityProductRepository();
    const result = await repo.findByIds(["prod-2"], "standard");

    expect(result[0].unitPrice.amount).toBe(0);
    expect(result[0].paymentTiming).toBe("after_order");
  });

  it("固定価格商品で該当ランクの価格が未設定の場合はProductPriceNotSetErrorを投げる", async () => {
    fetchMock.mockResolvedValue([
      {
        _id: "prod-3",
        name: "商品C",
        is_negotiable: false,
        prices: { starter: 1000 },
        min_rank: "starter",
        payment_timing: "at_order",
      },
    ]);

    const repo = new SanityProductRepository();

    await expect(repo.findByIds(["prod-3"], "standard")).rejects.toThrow(
      ProductPriceNotSetError
    );
  });
});
