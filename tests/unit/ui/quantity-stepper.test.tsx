// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QuantityStepper } from "@/components/ui/quantity-stepper";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("QuantityStepper", () => {
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

  function button(label: string): HTMLButtonElement {
    const el = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`
    );
    if (!el) throw new Error(`「${label}」のボタンが無い`);
    return el;
  }

  it("数量を label の group で囲み、減らす・増やすのボタンと数量を出す", () => {
    act(() =>
      root.render(
        <QuantityStepper
          label="レザートートバッグの数量"
          value={3}
          onChange={() => {}}
        />
      )
    );

    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("レザートートバッグの数量");
    expect(group?.querySelector("[aria-live]")?.textContent).toBe("3");
    expect(button("数量を減らす").type).toBe("button");
    expect(button("数量を増やす").type).toBe("button");
  });

  it("押すと1つ減らした・増やした数量で onChange を呼ぶ", () => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <QuantityStepper label="数量" value={3} onChange={onChange} />
      )
    );

    act(() => button("数量を減らす").click());
    act(() => button("数量を増やす").click());
    expect(onChange.mock.calls).toEqual([[2], [4]]);
  });

  it("最小値（既定は1）では「減らす」を押せない", () => {
    act(() =>
      root.render(
        <QuantityStepper label="数量" value={1} onChange={() => {}} />
      )
    );
    expect(button("数量を減らす").disabled).toBe(true);
    expect(button("数量を増やす").disabled).toBe(false);

    act(() =>
      root.render(
        <QuantityStepper label="数量" value={2} min={2} onChange={() => {}} />
      )
    );
    expect(button("数量を減らす").disabled).toBe(true);
  });

  it("disabled のときは「増やす」も「減らす」も押せない", () => {
    act(() =>
      root.render(
        <QuantityStepper label="数量" value={3} disabled onChange={() => {}} />
      )
    );
    expect(button("数量を増やす").disabled).toBe(true);
    expect(button("数量を減らす").disabled).toBe(true);
  });

  it("size で押せる範囲の高さを選べる（商品詳細は44px以上、カートは40px）", () => {
    act(() =>
      root.render(
        <>
          <QuantityStepper label="md" value={1} onChange={() => {}} />
          <QuantityStepper label="sm" value={1} size="sm" onChange={() => {}} />
        </>
      )
    );

    const [md, sm] = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="数量を増やす"]'
      ),
    ];
    expect(md.className).toContain("h-13");
    expect(sm.className).toContain("h-10");
  });
});
