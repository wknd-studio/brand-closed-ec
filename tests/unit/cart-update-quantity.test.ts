import { describe, it, expect } from "vitest";
import { calcItemUpdateError } from "@/lib/cart/cookie";
import type { Cart } from "@/lib/cart/types";

const cart: Cart = {
  items: [
    {
      productId: "p1",
      productName: "商品A",
      thumbnail: null,
      quantity: 2,
      unitPrice: 10_000,
      availability: "available",
    },
    {
      productId: "p2",
      productName: "商品B",
      thumbnail: null,
      quantity: 1,
      unitPrice: 5_000,
      availability: "available",
    },
  ],
};

describe("calcItemUpdateError", () => {
  it("月間仕入れ上限内なら undefined を返す", () => {
    // p1を3に変更: confirmedAmount(0) + p2(5_000×1) + p1(10_000×3) = 35_000 <= 100_000
    expect(
      calcItemUpdateError({
        cart,
        productId: "p1",
        newQuantity: 3,
        confirmedAmount: 0,
        monthlyLimit: 100_000,
      })
    ).toBeUndefined();
  });

  it("月間仕入れ上限を超える場合はエラーメッセージを返す", () => {
    // p1を3に変更: confirmedAmount(80_000) + p2(5_000×1) + p1(10_000×3) = 115_000 > 100_000
    const result = calcItemUpdateError({
      cart,
      productId: "p1",
      newQuantity: 3,
      confirmedAmount: 80_000,
      monthlyLimit: 100_000,
    });
    expect(result).toBeTruthy();
    expect(result).toContain("100,000");
  });

  it("要相談商品（unitPrice=null）は上限チェックをスキップして undefined を返す", () => {
    const cartWithNegotiable: Cart = {
      items: [
        {
          productId: "p3",
          productName: "要相談商品",
          thumbnail: null,
          quantity: 1,
          unitPrice: null,
          availability: "available",
        },
      ],
    };
    expect(
      calcItemUpdateError({
        cart: cartWithNegotiable,
        productId: "p3",
        newQuantity: 100,
        confirmedAmount: 0,
        monthlyLimit: 1_000,
      })
    ).toBeUndefined();
  });

  it("monthlyLimit=0（制限なし）の場合は undefined を返す", () => {
    expect(
      calcItemUpdateError({
        cart,
        productId: "p1",
        newQuantity: 999,
        confirmedAmount: 0,
        monthlyLimit: 0,
      })
    ).toBeUndefined();
  });

  it("上限超過状態でも数量を減らす方向なら undefined を返す", () => {
    // p1(quantity=2)を1に減らす: 既に上限超過していても減少は許可
    expect(
      calcItemUpdateError({
        cart,
        productId: "p1",
        newQuantity: 1,
        confirmedAmount: 95_000,
        monthlyLimit: 100_000,
      })
    ).toBeUndefined();
  });
});
