import { describe, it, expect } from "vitest";
import {
  selectNotAccessibleProductIds,
  sumCheckoutFixedTotal,
} from "@/domain/services/checkout-access";

describe("selectNotAccessibleProductIds（注文確認画面の権限外の商品）", () => {
  it("全商品が閲覧できるなら、権限外の商品は無い", () => {
    expect(
      selectNotAccessibleProductIds(
        ["p1", "p2"],
        [
          { id: "p1", isAccessible: true },
          { id: "p2", isAccessible: true },
        ]
      )
    ).toEqual([]);
  });

  it("閲覧できない商品だけを、カートの並び順で返す", () => {
    expect(
      selectNotAccessibleProductIds(
        ["p1", "p2", "p3"],
        [
          { id: "p3", isAccessible: false },
          { id: "p2", isAccessible: true },
          { id: "p1", isAccessible: false },
        ]
      )
    ).toEqual(["p1", "p3"]);
  });

  it("Sanity から削除済みの商品はランクを判定できないため含めない", () => {
    expect(
      selectNotAccessibleProductIds(
        ["deleted", "p1"],
        [{ id: "p1", isAccessible: false }]
      )
    ).toEqual(["p1"]);
  });
});

describe("sumCheckoutFixedTotal（注文確認画面の固定金額の合計）", () => {
  it("要相談の商品と権限外の商品を含めずに合計する", () => {
    expect(
      sumCheckoutFixedTotal([
        {
          productId: "p1",
          unitPrice: 1000,
          quantity: 2,
          isNotAccessible: false,
        },
        {
          productId: "p2",
          unitPrice: null,
          quantity: 1,
          isNotAccessible: false,
        },
        {
          productId: "p3",
          unitPrice: 5000,
          quantity: 3,
          isNotAccessible: true,
        },
        {
          productId: "p4",
          unitPrice: 300,
          quantity: 1,
          isNotAccessible: false,
        },
      ])
    ).toBe(2300);
  });
});
