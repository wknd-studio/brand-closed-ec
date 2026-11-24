// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LimitMeter } from "@/components/ui/limit-meter";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("LimitMeter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: ComponentProps<typeof LimitMeter>) {
    act(() => root.render(<LimitMeter {...props} />));
  }

  const text = () => container.textContent ?? "";
  const segment = (name: string) =>
    container.querySelector<HTMLElement>(`[data-segment="${name}"]`);

  const OK = {
    monthlyLimit: 5_000_000,
    confirmedAmount: 1_090_500,
    cartAmount: 149_500,
    remaining: 3_760_000,
  };

  describe("小さい形（compact）", () => {
    it("「今月の仕入れ枠」と上限、残り・使用（確定した注文＋カートの商品）の金額を出す", () => {
      render(OK);

      expect(text()).toContain("今月の仕入れ枠");
      expect(text()).toContain("上限 ¥5,000,000");
      expect(text()).toContain("残り ¥3,760,000");
      expect(text()).toContain("使用 ¥1,240,000");
    });

    it("バーを、確定した注文とカートの商品の2つに分けて、上限に対する割合で伸ばす", () => {
      render(OK);

      expect(segment("confirmed")?.style.width).toBe("21.81%");
      expect(segment("cart")?.style.width).toBe("2.99%");
      expect(segment("confirmed")?.className).toContain("bg-primary");
      expect(segment("cart")?.className).toContain("bg-primary-light");
    });

    it("cartBreakdown を渡すと、使用の金額にカートの商品の分を添える", () => {
      render({ ...OK, cartBreakdown: true });

      expect(text()).toContain("使用 ¥1,240,000（うちカート ¥149,500）");
    });

    it("使用率が90%未満なら注意色にしない", () => {
      render({
        monthlyLimit: 1_000_000,
        confirmedAmount: 899_999,
        cartAmount: 0,
        remaining: 100_001,
      });

      expect(container.innerHTML).not.toContain("warning");
    });

    it("使用率が90%以上（上限間近）なら、残りの金額とバーを注意色にする", () => {
      render({
        monthlyLimit: 1_000_000,
        confirmedAmount: 800_000,
        cartAmount: 100_000,
        remaining: 100_000,
      });

      expect(segment("confirmed")?.className).toContain("bg-warning");
      expect(
        [...container.querySelectorAll("span")].find((el) =>
          el.textContent?.startsWith("残り")
        )?.className
      ).toContain("text-warning");
    });

    it("上限を超えていれば、超えた金額を出し、バーは100%で止める", () => {
      render({
        monthlyLimit: 1_000_000,
        confirmedAmount: 900_000,
        cartAmount: 200_000,
        remaining: -100_000,
      });

      expect(text()).toContain("超過 ¥100,000");
      expect(segment("confirmed")?.style.width).toBe("90%");
      expect(segment("cart")?.style.width).toBe("10%");
    });

    it("上限0（会員の情報が無い）なら、上限間近として扱う", () => {
      render({
        monthlyLimit: 0,
        confirmedAmount: 0,
        cartAmount: 0,
        remaining: 0,
      });

      expect(text()).toContain("残り ¥0");
      expect(container.innerHTML).toContain("text-warning");
    });

    it("無制限のプランはバーを出さず「上限なし」と出す", () => {
      render({
        monthlyLimit: null,
        confirmedAmount: 1_090_500,
        cartAmount: 149_500,
        remaining: null,
      });

      expect(segment("confirmed")).toBeNull();
      expect(segment("cart")).toBeNull();
      expect(text()).toContain("上限なし");
      expect(text()).toContain("使用 ¥1,240,000");
      expect(text()).not.toContain("残り");
    });
  });

  describe("内訳まで出す形（detail）", () => {
    it("上限（プラン名）・確定した注文・カートの商品・残りの内訳と、カートも枠に含める旨を出す", () => {
      render({ ...OK, variant: "detail", planName: "スタンダード" });

      const rows = [...container.querySelectorAll("dl > div")].map((row) => [
        row.querySelector("dt")?.textContent,
        row.querySelector("dd")?.textContent,
      ]);
      expect(rows).toEqual([
        ["上限（スタンダード）", "¥5,000,000"],
        ["確定した注文", "¥1,090,500"],
        ["カートの商品", "¥149,500"],
        ["残り", "¥3,760,000"],
      ]);
      expect(text()).toContain(
        "カートに入れた商品も、注文の前から枠に含めて計算します"
      );
    });

    it("無制限のプランは、上限・残りを「無制限」「上限なし」で出し、バーを出さない", () => {
      render({
        monthlyLimit: null,
        confirmedAmount: 1_000,
        cartAmount: 500,
        remaining: null,
        variant: "detail",
      });

      const rows = [...container.querySelectorAll("dl > div")].map((row) => [
        row.querySelector("dt")?.textContent,
        row.querySelector("dd")?.textContent,
      ]);
      expect(rows).toEqual([
        ["上限", "無制限"],
        ["確定した注文", "¥1,000"],
        ["カートの商品", "¥500"],
        ["残り", "上限なし"],
      ]);
      expect(segment("confirmed")).toBeNull();
    });
  });
});
