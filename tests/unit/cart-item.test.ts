import { describe, it, expect } from "vitest";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { ProductSnapshot } from "@/domain/value-objects/product-snapshot";
import { ProductNotAccessibleError } from "@/domain/errors/product-not-accessible-error";

describe("CartItem", () => {
  const base = {
    sanityProductId: "prod-001",
    productName: "テスト商品",
    quantity: 2,
    unitPrice: Money.of(10_000),
    isNegotiable: false,
    paymentTiming: "at_order" as const,
  };

  describe("of()", () => {
    it("CartItem を生成できる", () => {
      const item = CartItem.of(base);
      expect(item.sanityProductId).toBe("prod-001");
      expect(item.quantity).toBe(2);
    });

    it("paymentTiming を保持する", () => {
      const item = CartItem.of({ ...base, paymentTiming: "after_order" });
      expect(item.paymentTiming).toBe("after_order");
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

  describe("fromProducts()", () => {
    const fixedProduct: ProductSnapshot = {
      sanityProductId: "prod-1",
      productName: "固定商品",
      unitPrice: Money.of(100_000),
      isNegotiable: false,
      minRank: "standard",
      paymentTiming: "at_order",
    };
    const negotiableProduct: ProductSnapshot = {
      sanityProductId: "prod-2",
      productName: "交渉商品",
      unitPrice: Money.of(50_000),
      isNegotiable: true,
      minRank: "starter",
      paymentTiming: "after_order",
    };

    it("サーバー側の商品情報とカートの数量から明細を作る", () => {
      const [item] = CartItem.fromProducts(
        [{ sanityProductId: "prod-1", quantity: 3 }],
        [fixedProduct],
        MemberRank.of("standard")
      );
      expect(item.sanityProductId).toBe("prod-1");
      expect(item.productName).toBe("固定商品");
      expect(item.quantity).toBe(3);
      expect(item.unitPrice.amount).toBe(100_000);
      expect(item.isNegotiable).toBe(false);
      expect(item.paymentTiming).toBe("at_order");
    });

    it("カートの商品が商品情報に無ければエラーにする", () => {
      expect(() =>
        CartItem.fromProducts(
          [{ sanityProductId: "prod-unknown", quantity: 1 }],
          [fixedProduct],
          MemberRank.of("standard")
        )
      ).toThrow("商品が見つかりません");
    });

    it("会員のランクで商品にアクセスできなければProductNotAccessibleErrorにする", () => {
      let error: unknown;
      try {
        CartItem.fromProducts(
          [{ sanityProductId: "prod-1", quantity: 1 }],
          [fixedProduct],
          MemberRank.of("basic")
        );
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ProductNotAccessibleError);
      expect(error).toMatchObject({
        productId: "prod-1",
        userRank: "basic",
        requiredRank: "standard",
      });
    });

    it("要相談の商品は単価を0円にする", () => {
      const [item] = CartItem.fromProducts(
        [{ sanityProductId: "prod-2", quantity: 1 }],
        [negotiableProduct],
        MemberRank.of("starter")
      );
      expect(item.unitPrice.amount).toBe(0);
      expect(item.isNegotiable).toBe(true);
    });

    it("カートの商品名・価格・支払いタイミングは使わず、サーバー側の商品情報の値を使う", () => {
      const tamperedLine = {
        sanityProductId: "prod-1",
        quantity: 2,
        productName: "偽装商品名",
        unitPrice: 1,
        paymentTiming: "after_order",
      };
      const [item] = CartItem.fromProducts(
        [tamperedLine],
        [fixedProduct],
        MemberRank.of("standard")
      );
      expect(item.productName).toBe("固定商品");
      expect(item.unitPrice.amount).toBe(100_000);
      expect(item.paymentTiming).toBe("at_order");
      expect(item.quantity).toBe(2);
    });

    it("カートの並び順のまま明細を作る", () => {
      const items = CartItem.fromProducts(
        [
          { sanityProductId: "prod-2", quantity: 1 },
          { sanityProductId: "prod-1", quantity: 1 },
        ],
        [fixedProduct, negotiableProduct],
        MemberRank.of("standard")
      );
      expect(items.map((i) => i.sanityProductId)).toEqual(["prod-2", "prod-1"]);
    });
  });
});
