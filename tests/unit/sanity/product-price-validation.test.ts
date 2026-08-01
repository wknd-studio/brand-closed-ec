import { describe, it, expect } from "vitest";
import { validatePrices } from "@/sanity/schemas/product";

describe("validatePrices", () => {
  it("要相談商品は価格が未設定でもOK", () => {
    expect(validatePrices(undefined, { is_negotiable: true })).toBe(true);
  });

  it("固定価格商品でpricesオブジェクト自体が未設定はNG", () => {
    expect(validatePrices(undefined, { is_negotiable: false })).not.toBe(true);
  });

  it("固定価格商品で一部ランクが未入力の場合はNGで欠けているランクを示す", () => {
    const result = validatePrices(
      { starter: 100, basic: 200 },
      { is_negotiable: false }
    );

    expect(result).not.toBe(true);
    expect(result).toContain("standard");
  });

  it("固定価格商品でenterprise以外の6ランク全て入力済みならOK", () => {
    const result = validatePrices(
      {
        starter: 100,
        basic: 200,
        standard: 300,
        pro: 400,
        advanced: 500,
        premium: 600,
      },
      { is_negotiable: false }
    );

    expect(result).toBe(true);
  });

  it("enterpriseの価格は必須ではない", () => {
    const result = validatePrices(
      {
        starter: 100,
        basic: 200,
        standard: 300,
        pro: 400,
        advanced: 500,
        premium: 600,
        enterprise: undefined,
      },
      { is_negotiable: false }
    );

    expect(result).toBe(true);
  });

  it("仕入れ掛け率(vendor_cost_rate)を下回るランクがあればNG（specs/004-product-data-import）", () => {
    // 定価10,000円・仕入れ掛け率70% => 仕入れ値7,000円。starterは6,000円で原価割れ
    const result = validatePrices(
      {
        starter: 6000,
        basic: 7500,
        standard: 8000,
        pro: 8500,
        advanced: 9000,
        premium: 9500,
      },
      { is_negotiable: false, retail_price: 10000, vendor_cost_rate: 70 }
    );

    expect(result).not.toBe(true);
    expect(result).toContain("starter");
  });

  it("全ランクが仕入れ掛け率以上であればOK", () => {
    const result = validatePrices(
      {
        starter: 7000,
        basic: 7500,
        standard: 8000,
        pro: 8500,
        advanced: 9000,
        premium: 9500,
      },
      { is_negotiable: false, retail_price: 10000, vendor_cost_rate: 70 }
    );

    expect(result).toBe(true);
  });

  it("vendor_cost_rateが未設定なら下限チェックは行わない", () => {
    const result = validatePrices(
      {
        starter: 100,
        basic: 200,
        standard: 300,
        pro: 400,
        advanced: 500,
        premium: 600,
      },
      { is_negotiable: false }
    );

    expect(result).toBe(true);
  });
});
