// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Alert } from "@/components/ui/alert";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Alert", () => {
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

  it("使う側が選んだ role を付ける（結果の知らせは status、エラーは alert）", () => {
    act(() =>
      root.render(
        <>
          <Alert tone="success" role="status">
            カートに追加しました
          </Alert>
          <Alert tone="danger" role="alert">
            上限を超えます
          </Alert>
        </>
      )
    );

    const roles = [...container.children].map((el) => el.getAttribute("role"));
    expect(roles).toEqual(["status", "alert"]);
  });

  it("見出し・本文・右側の操作を出し、アイコンは読み上げない", () => {
    act(() =>
      root.render(
        <Alert
          tone="success"
          role="status"
          title="カートに追加しました"
          action={<a href="/cart">カートを見る</a>}
        >
          レザートートバッグ × 1
        </Alert>
      )
    );

    const alert = container.querySelector('[role="status"]');
    expect(alert?.textContent).toBe(
      "カートに追加しましたレザートートバッグ × 1カートを見る"
    );
    expect(alert?.querySelector("a")?.getAttribute("href")).toBe("/cart");
    expect(alert?.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("tone ごとに色とアイコンが変わる", () => {
    const tones = ["success", "danger", "warning", "info", "neutral"] as const;
    act(() =>
      root.render(
        <>
          {tones.map((tone) => (
            <Alert key={tone} tone={tone} role="status">
              {tone}
            </Alert>
          ))}
        </>
      )
    );

    const alerts = [...container.children];
    expect(alerts[0].className).toContain("text-success");
    expect(alerts[1].className).toContain("text-danger");
    expect(alerts[2].className).toContain("text-warning");
    expect(alerts[3].className).toContain("text-info");
    expect(alerts[4].className).toContain("text-neutral-700");
    const icons = alerts.map((el) => el.querySelector("svg")?.innerHTML);
    expect(new Set(icons).size).toBe(tones.length);
  });

  it("ref・tabIndex を渡してフォーカスを移せる（エラーのまとめにフォーカスを移すため）", () => {
    const ref = createRef<HTMLDivElement>();
    act(() =>
      root.render(
        <Alert ref={ref} tone="danger" role="alert" tabIndex={-1}>
          入力内容をご確認ください。
        </Alert>
      )
    );

    const alert = container.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.getAttribute("tabindex")).toBe("-1");
    act(() => ref.current?.focus());
    expect(document.activeElement).toBe(alert);
  });
});
