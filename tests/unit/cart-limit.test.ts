import { describe, it, expect } from "vitest";
import {
  sumCartFixedTotal,
  canAddToCart,
  canChangeCartQuantity,
} from "@/domain/services/cart-limit";

const lines = [
  { productId: "p1", unitPrice: 10_000, quantity: 2 },
  { productId: "p2", unitPrice: 5_000, quantity: 1 },
];

const negotiable = { productId: "p3", unitPrice: null, quantity: 3 };

describe("sumCartFixedTotal", () => {
  it("固定価格の明細だけを合計する（要相談はスキップ）", () => {
    // p1: 10,000 × 2 + p2: 5,000 × 1 = 25,000 / p3: 要相談（null）はスキップ
    expect(sumCartFixedTotal([...lines, negotiable])).toBe(25_000);
  });

  it("空のカートは0を返す", () => {
    expect(sumCartFixedTotal([])).toBe(0);
  });

  it("全明細が要相談なら0を返す", () => {
    expect(sumCartFixedTotal([negotiable])).toBe(0);
  });
});

describe("canAddToCart", () => {
  it("確定額 + カートの確定額 + 追加分が上限以内なら追加できる", () => {
    // 50,000 + 25,000 + 10,000 × 2 = 95,000 <= 100,000
    expect(
      canAddToCart({
        lines,
        unitPrice: 10_000,
        quantity: 2,
        confirmedAmount: 50_000,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("ちょうど上限と同額なら追加できる", () => {
    // 65,000 + 25,000 + 10,000 = 100,000
    expect(
      canAddToCart({
        lines,
        unitPrice: 10_000,
        quantity: 1,
        confirmedAmount: 65_000,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("上限を超えるなら追加できない", () => {
    // 70,000 + 25,000 + 10,000 = 105,000 > 100,000
    expect(
      canAddToCart({
        lines,
        unitPrice: 10_000,
        quantity: 1,
        confirmedAmount: 70_000,
        monthlyLimit: 100_000,
      })
    ).toBe(false);
  });

  it("要相談の商品（unitPrice=null）は上限を超えていても追加できる", () => {
    expect(
      canAddToCart({
        lines,
        unitPrice: null,
        quantity: 100,
        confirmedAmount: 200_000,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("上限0は上限無しとして扱わず、価格のある商品は追加できない", () => {
    expect(
      canAddToCart({
        lines: [],
        unitPrice: 1,
        quantity: 1,
        confirmedAmount: 0,
        monthlyLimit: 0,
      })
    ).toBe(false);
  });
});

describe("canChangeCartQuantity", () => {
  it("月間仕入れ上限内なら変更できる", () => {
    // p1を3に変更: 0 + p2(5,000×1) + p1(10,000×3) = 35,000 <= 100,000
    expect(
      canChangeCartQuantity({
        lines,
        productId: "p1",
        newQuantity: 3,
        confirmedAmount: 0,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("月間仕入れ上限を超えるなら変更できない", () => {
    // p1を3に変更: 80,000 + p2(5,000×1) + p1(10,000×3) = 115,000 > 100,000
    expect(
      canChangeCartQuantity({
        lines,
        productId: "p1",
        newQuantity: 3,
        confirmedAmount: 80_000,
        monthlyLimit: 100_000,
      })
    ).toBe(false);
  });

  it("他の明細に要相談があっても、固定価格の明細だけで判定する", () => {
    // p1を3に変更: 65,000 + p2(5,000×1) + p1(10,000×3) = 100,000（p3は含めない）
    expect(
      canChangeCartQuantity({
        lines: [...lines, negotiable],
        productId: "p1",
        newQuantity: 3,
        confirmedAmount: 65_000,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("要相談の明細（unitPrice=null）は判定せずに変更できる", () => {
    expect(
      canChangeCartQuantity({
        lines: [negotiable],
        productId: "p3",
        newQuantity: 100,
        confirmedAmount: 0,
        monthlyLimit: 1_000,
      })
    ).toBe(true);
  });

  it("カートに無い商品は判定せずに変更できる（カートは変わらない）", () => {
    expect(
      canChangeCartQuantity({
        lines,
        productId: "unknown",
        newQuantity: 100,
        confirmedAmount: 200_000,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("上限超過状態でも数量を減らす方向なら変更できる", () => {
    // p1(quantity=2)を1に減らす: 既に上限超過していても減少は許可
    expect(
      canChangeCartQuantity({
        lines,
        productId: "p1",
        newQuantity: 1,
        confirmedAmount: 95_000,
        monthlyLimit: 100_000,
      })
    ).toBe(true);
  });

  it("上限0は上限無しとして扱わず、数量を増やせない（追加と同じ扱い）", () => {
    expect(
      canChangeCartQuantity({
        lines,
        productId: "p1",
        newQuantity: 3,
        confirmedAmount: 0,
        monthlyLimit: 0,
      })
    ).toBe(false);
  });
});
