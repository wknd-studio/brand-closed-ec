import { describe, it, expect } from "vitest";
import { OrderItem } from "@/domain/entities/order-item";
import { Money } from "@/domain/value-objects/money";

function makeItem(overrides: Partial<Parameters<typeof OrderItem.of>[0]> = {}) {
  return OrderItem.of({
    id: "item-001",
    sanityProductId: "prod-001",
    productNameSnapshot: "テスト商品",
    unitPriceSnapshot: Money.of(10_000),
    quantity: 2,
    isNegotiable: false,
    negotiatedUnitPrice: null,
    paymentTiming: "at_order",
    settlementId: null,
    ...overrides,
  });
}

describe("OrderItem", () => {
  describe("getSubtotal()", () => {
    it("固定価格アイテムは unitPriceSnapshot × quantity", () => {
      const item = makeItem({
        unitPriceSnapshot: Money.of(10_000),
        quantity: 3,
      });
      expect(item.getSubtotal().amount).toBe(30_000);
    });

    it("価格確定済みの要相談アイテムは negotiatedUnitPrice × quantity", () => {
      const item = makeItem({
        isNegotiable: true,
        unitPriceSnapshot: Money.of(0),
        negotiatedUnitPrice: Money.of(80_000),
        quantity: 2,
      });
      expect(item.getSubtotal().amount).toBe(160_000);
    });

    it("価格未確定の要相談アイテムは 0", () => {
      const item = makeItem({
        isNegotiable: true,
        unitPriceSnapshot: Money.of(0),
        negotiatedUnitPrice: null,
      });
      expect(item.getSubtotal().amount).toBe(0);
    });
  });

  describe("isPriceConfirmed()", () => {
    it("固定価格アイテムは true", () => {
      expect(makeItem({ isNegotiable: false }).isPriceConfirmed()).toBe(true);
    });

    it("要相談かつ negotiatedUnitPrice あり は true", () => {
      expect(
        makeItem({
          isNegotiable: true,
          negotiatedUnitPrice: Money.of(80_000),
        }).isPriceConfirmed()
      ).toBe(true);
    });

    it("要相談かつ negotiatedUnitPrice なし は false", () => {
      expect(
        makeItem({
          isNegotiable: true,
          negotiatedUnitPrice: null,
        }).isPriceConfirmed()
      ).toBe(false);
    });
  });

  describe("isAfterOrder()", () => {
    // 注文完了画面の「今回のお支払い」と「後払い（請求書）」の振り分けの正
    it("注文確定時のスナップショットが after_order の明細は true", () => {
      expect(makeItem({ paymentTiming: "after_order" }).isAfterOrder()).toBe(
        true
      );
    });

    it("at_order の明細は false", () => {
      expect(makeItem({ paymentTiming: "at_order" }).isAfterOrder()).toBe(
        false
      );
    });
  });
});
