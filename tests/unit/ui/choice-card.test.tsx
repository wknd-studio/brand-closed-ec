// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChoiceCard } from "@/components/ui/choice-card";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ChoiceCard", () => {
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

  function render() {
    act(() =>
      root.render(
        <ChoiceCard className="p-4">
          <input type="radio" name="plan" value="basic" />
          ベーシック
        </ChoiceCard>
      )
    );
    const label = container.querySelector("label");
    if (!label) throw new Error("label が無い");
    return label;
  }

  it("カード全体を label にして、中のラジオボタンをカードのどこを押しても選べるようにする", () => {
    const label = render();
    const input = label.querySelector("input");

    act(() => label.click());

    expect(input?.checked).toBe(true);
  });

  it("選ばれたとき・キーボードのフォーカスがあるときの見た目を、中の入力欄の状態から付ける", () => {
    const className = render().className;

    expect(className).toContain("has-checked:border-primary");
    expect(className).toContain("has-focus-visible:outline-primary");
  });

  it("渡した className を足す", () => {
    expect(render().className).toContain("p-4");
  });
});
