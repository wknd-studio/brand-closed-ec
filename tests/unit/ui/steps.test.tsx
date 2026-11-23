// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Steps } from "@/components/ui/steps";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const STEPS = ["ご利用の種別", "プラン・お客様情報", "お支払い"];

describe("Steps", () => {
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

  it("全体を「お手続きの進み具合」のnavで囲み、ステップを番号付きで並べる", () => {
    act(() => root.render(<Steps steps={STEPS} current={1} />));

    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("お手続きの進み具合");
    const items = [...container.querySelectorAll("nav ol > li")];
    expect(items.map((li) => li.textContent)).toEqual([
      "1 ご利用の種別",
      "2 プラン・お客様情報",
      "3 お支払い",
    ]);
  });

  it('今のステップだけに aria-current="step" が付く', () => {
    act(() => root.render(<Steps steps={STEPS} current={1} />));

    const items = [...container.querySelectorAll("nav ol > li")];
    expect(items.map((li) => li.getAttribute("aria-current"))).toEqual([
      null,
      "step",
      null,
    ]);
  });
});
