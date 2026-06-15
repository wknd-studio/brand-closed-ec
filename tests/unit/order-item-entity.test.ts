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
});
