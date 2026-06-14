import { describe, it, expect } from "vitest";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";

describe("CartItem", () => {
  const base = {
    sanityProductId: "prod-001",
    productName: "テスト商品",
    quantity: 2,
    unitPrice: Money.of(10_000),
    isNegotiable: false,
  };

  describe("of()", () => {
    it("CartItem を生成できる", () => {
      const item = CartItem.of(base);
      expect(item.sanityProductId).toBe("prod-001");
      expect(item.quantity).toBe(2);
    });

    it("数量 0 はエラー", () => {
      expect(() => CartItem.of({ ...base, quantity: 0 })).toThrow();
    });

    it("数量 マイナスはエラー", () => {
      expect(() => CartItem.of({ ...base, quantity: -1 })).toThrow();
    });
  });

  describe("getSubtotal()", () => {
    it("単価 × 数量を返す", () => {
      const item = CartItem.of(base);
      expect(item.getSubtotal().amount).toBe(20_000);
    });

    it("数量 1 の場合は単価と同じ", () => {
      const item = CartItem.of({ ...base, quantity: 1 });
      expect(item.getSubtotal().amount).toBe(10_000);
    });
  });

  describe("updateQuantity()", () => {
    it("新しい数量の CartItem を返す（不変）", () => {
      const original = CartItem.of(base);
      const updated = original.updateQuantity(5);
      expect(updated.quantity).toBe(5);
      expect(original.quantity).toBe(2); // 元は変わらない
    });

    it("数量 0 はエラー", () => {
      const item = CartItem.of(base);
      expect(() => item.updateQuantity(0)).toThrow();
    });
  });
});
