import { describe, it, expect } from "vitest";
import { PLANS } from "@/app/home-presenter";

// トップページのプラン比較表（#558）。ランクをキーにした定義から作るように変えても、表示が変わらないこと
describe("トップページのプラン比較表（PLANS）", () => {
  it("全ランクが下位から順に、ラベル・名称・料金・上限付きで並ぶ（ENTERPRISEは要相談・無制限）", () => {
    expect(PLANS).toEqual([
      {
        id: "starter",
        label: "STARTER",
        name: "入門",
        description: "副業・お試し層向け",
        monthlyFee: "5,000",
        initialFee: "5,000",
        monthlyLimit: "300,000",
        featured: false,
      },
      {
        id: "basic",
        label: "BASIC",
        name: "基本",
        description: "個人せどり・副業層向け",
        monthlyFee: "10,000",
        initialFee: "10,000",
        monthlyLimit: "1,000,000",
        featured: false,
      },
      {
        id: "standard",
        label: "STANDARD",
        name: "標準",
        description: "本業EC事業者・小規模セレクトショップ向け",
        monthlyFee: "30,000",
        initialFee: "30,000",
        monthlyLimit: "5,000,000",
        featured: true,
      },
      {
        id: "pro",
        label: "PRO",
        name: "上位",
        description: "中規模セレクトショップ・法人向け",
        monthlyFee: "50,000",
        initialFee: "50,000",
        monthlyLimit: "20,000,000",
        featured: false,
      },
      {
        id: "advanced",
        label: "ADVANCED",
        name: "上級",
        description: "中〜大規模法人向け",
        monthlyFee: "110,000",
        initialFee: "110,000",
        monthlyLimit: "50,000,000",
        featured: false,
      },
      {
        id: "premium",
        label: "PREMIUM",
        name: "最上位",
        description: "大規模法人・チェーン店向け",
        monthlyFee: "330,000",
        initialFee: "330,000",
        monthlyLimit: "100,000,000",
        featured: false,
      },
      {
        id: "enterprise",
        label: "ENTERPRISE",
        name: "個別契約",
        description: "SLA対応・専任チームサポート付き",
        monthlyFee: "要相談",
        initialFee: "要相談",
        monthlyLimit: "無制限",
        featured: false,
      },
    ]);
  });
});
