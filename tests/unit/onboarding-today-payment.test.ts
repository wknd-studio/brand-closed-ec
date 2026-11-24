import { describe, it, expect } from "vitest";
import { todayPayment } from "@/app/onboarding/plan/today-payment";
import { PLANS } from "@/app/home-presenter";

// 入会の最終確認画面のまとめに出す「本日のお支払い」（初期費用＋初月の月額。#747）
describe("todayPayment", () => {
  it("初期費用と初月の月額を足し、3桁区切りで返す", () => {
    expect(todayPayment({ initialFee: "5,000", monthlyFee: "5,000" })).toBe(
      "10,000"
    );
  });

  it("初期費用と月額が違っても足し合わせる", () => {
    expect(todayPayment({ initialFee: "330,000", monthlyFee: "50,000" })).toBe(
      "380,000"
    );
  });

  it("「要相談」の金額を含むときは null を返す", () => {
    expect(todayPayment({ initialFee: "要相談", monthlyFee: "要相談" })).toBe(
      null
    );
    expect(todayPayment({ initialFee: "5,000", monthlyFee: "要相談" })).toBe(
      null
    );
  });

  it("トップページの料金表の値から、申込みできるプランの本日のお支払いを出せる", () => {
    expect(
      Object.fromEntries(PLANS.map((plan) => [plan.id, todayPayment(plan)]))
    ).toEqual({
      starter: "10,000",
      basic: "20,000",
      standard: "60,000",
      pro: "100,000",
      advanced: "220,000",
      premium: "660,000",
      enterprise: null,
    });
  });
});
