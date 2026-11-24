import { describe, it, expect } from "vitest";
import { groupItemsBySettlement } from "@/domain/services/settlement-grouping";

const settlement = (id: string) => ({ id });
const item = (id: string, settlementId: string | null) => ({
  id,
  settlementId,
});

describe("groupItemsBySettlement", () => {
  it("明細を決済単位ごとに分け、決済単位の並びを保つ", () => {
    const result = groupItemsBySettlement(
      [settlement("s-checkout"), settlement("s-invoice")],
      [
        item("i-1", "s-invoice"),
        item("i-2", "s-checkout"),
        item("i-3", "s-invoice"),
      ]
    );

    expect(result.groups).toEqual([
      {
        settlement: settlement("s-checkout"),
        items: [item("i-2", "s-checkout")],
      },
      {
        settlement: settlement("s-invoice"),
        items: [item("i-1", "s-invoice"), item("i-3", "s-invoice")],
      },
    ]);
    expect(result.unassigned).toEqual([]);
  });

  it("決済単位に割り当てられていない明細（請求前）を分けて返す", () => {
    const result = groupItemsBySettlement(
      [settlement("s-checkout")],
      [item("i-1", "s-checkout"), item("i-2", null), item("i-3", null)]
    );

    expect(result.groups).toEqual([
      {
        settlement: settlement("s-checkout"),
        items: [item("i-1", "s-checkout")],
      },
    ]);
    expect(result.unassigned).toEqual([item("i-2", null), item("i-3", null)]);
  });

  it("明細の無い決済単位も、空の明細で返す", () => {
    const result = groupItemsBySettlement([settlement("s-empty")], []);

    expect(result.groups).toEqual([
      { settlement: settlement("s-empty"), items: [] },
    ]);
    expect(result.unassigned).toEqual([]);
  });
});
