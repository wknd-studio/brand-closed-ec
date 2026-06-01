import { describe, it, expect } from "vitest";
import {
  parseCart,
  serializeCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  calcCartFixedTotal,
} from "@/lib/cart/cookie";
import type { Cart } from "@/lib/cart/types";

const empty: Cart = { items: [] };

const withItems: Cart = {
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
      unitPrice: null,
      availability: "available",
    },
  ],
};

describe("parseCart", () => {
  it("空文字・undefinedは空カートを返す", () => {
    expect(parseCart(undefined)).toEqual(empty);
    expect(parseCart("")).toEqual(empty);
  });

  it("不正なJSONは空カートを返す", () => {
    expect(parseCart("invalid-json")).toEqual(empty);
  });

  it("正常なJSON文字列をパースする", () => {
    const serialized = serializeCart(withItems);
    expect(parseCart(serialized)).toEqual(withItems);
  });
});

describe("addItem", () => {
  it("新規アイテムを追加する", () => {
    const result = addItem(empty, {
      productId: "p1",
      productName: "商品A",
      thumbnail: null,
      unitPrice: 10_000,
      availability: "available",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      productId: "p1",
      productName: "商品A",
      thumbnail: null,
      quantity: 1,
      unitPrice: 10_000,
      availability: "available",
    });
  });

  it("既存アイテムは quantity が +1 される（デフォルト）", () => {
    const result = addItem(withItems, {
      productId: "p1",
      productName: "商品A",
      thumbnail: null,
      unitPrice: 10_000,
      availability: "available",
    });
    expect(result.items.find((i) => i.productId === "p1")?.quantity).toBe(3);
    expect(result.items).toHaveLength(2);
  });

  it("quantity を指定すると既存アイテムにその分が加算される", () => {
    const result = addItem(
      withItems,
      {
        productId: "p1",
        productName: "商品A",
        thumbnail: null,
        unitPrice: 10_000,
        availability: "available",
      },
      3
    );
    expect(result.items.find((i) => i.productId === "p1")?.quantity).toBe(5);
  });

  it("quantity を指定すると新規アイテムにその quantity で追加される", () => {
    const result = addItem(
      empty,
      {
        productId: "p3",
        productName: "商品C",
        thumbnail: null,
        unitPrice: 5_000,
        availability: "available",
      },
      4
    );
    expect(result.items[0].quantity).toBe(4);
  });

  it("要相談商品（unitPrice=null）も追加できる", () => {
    const result = addItem(empty, {
      productId: "p3",
      productName: "要相談商品",
      thumbnail: null,
      unitPrice: null,
      availability: "available",
    });
    expect(result.items[0].unitPrice).toBeNull();
  });
});

describe("updateQuantity", () => {
  it("数量を更新する", () => {
    const result = updateQuantity(withItems, "p1", 5);
    expect(result.items.find((i) => i.productId === "p1")?.quantity).toBe(5);
  });

  it("quantity=0 でアイテムが削除される", () => {
    const result = updateQuantity(withItems, "p1", 0);
    expect(result.items.find((i) => i.productId === "p1")).toBeUndefined();
  });

  it("存在しない productId は何も変更しない", () => {
    const result = updateQuantity(withItems, "unknown", 3);
    expect(result).toEqual(withItems);
  });
});

describe("removeItem", () => {
  it("指定アイテムを削除する", () => {
    const result = removeItem(withItems, "p1");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].productId).toBe("p2");
  });

  it("存在しない productId は何も変更しない", () => {
    const result = removeItem(withItems, "unknown");
    expect(result).toEqual(withItems);
  });
});

describe("clearCart", () => {
  it("空カートを返す", () => {
    expect(clearCart()).toEqual(empty);
  });
});

describe("calcCartFixedTotal", () => {
  it("固定価格商品のみ合計する（要相談商品はスキップ）", () => {
    // p1: 10,000 × 2 = 20,000 / p2: 要相談（null）はスキップ
    expect(calcCartFixedTotal(withItems)).toBe(20_000);
  });

  it("空カートは0を返す", () => {
    expect(calcCartFixedTotal(empty)).toBe(0);
  });

  it("全商品が要相談の場合は0を返す", () => {
    const cart: Cart = {
      items: [
        {
          productId: "p1",
          productName: "A",
          thumbnail: null,
          quantity: 3,
          unitPrice: null,
          availability: "available",
        },
      ],
    };
    expect(calcCartFixedTotal(cart)).toBe(0);
  });
});
