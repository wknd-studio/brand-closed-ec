import { describe, it, expect } from "vitest";
import {
  NON_PRICING_RANK_OPTIONS,
  PRICING_RANK_OPTIONS,
  RANK_OPTIONS,
} from "@/sanity/schemas/rank-options";
import { product } from "@/sanity/schemas/product";

// Sanity のランクの選択肢（#558）。ランクをキーにした定義から作るように変えても、表示が変わらないこと
describe("Sanity のランクの選択肢", () => {
  const ALL = [
    { title: "Starter", value: "starter" },
    { title: "Basic", value: "basic" },
    { title: "Standard", value: "standard" },
    { title: "Pro", value: "pro" },
    { title: "Advanced", value: "advanced" },
    { title: "Premium", value: "premium" },
    { title: "Enterprise", value: "enterprise" },
  ];

  it("RANK_OPTIONS は全ランクを下位から順に並べる", () => {
    expect(RANK_OPTIONS).toEqual(ALL);
  });

  it("PRICING_RANK_OPTIONS は個別契約のEnterpriseを除く", () => {
    expect(PRICING_RANK_OPTIONS).toEqual(ALL.slice(0, 6));
  });

  it("NON_PRICING_RANK_OPTIONS は個別契約のEnterpriseだけ", () => {
    expect(NON_PRICING_RANK_OPTIONS).toEqual([
      { title: "Enterprise", value: "enterprise" },
    ]);
  });

  it("商品の prices は全ランク（Enterprise を含む）の数値の項目を下位から順に持つ", () => {
    const prices = product.fields.find((field) => field.name === "prices") as
      | { fields: { name: string; title?: string; type: string }[] }
      | undefined;
    expect(
      prices?.fields.map(({ name, title, type }) => ({ name, title, type }))
    ).toEqual(
      ALL.map(({ title, value }) => ({ name: value, title, type: "number" }))
    );
  });
});
