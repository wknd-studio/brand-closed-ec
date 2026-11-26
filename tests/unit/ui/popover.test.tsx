// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Popover", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <div>
          <p id="outside">外側</p>
          <Popover>
            <PopoverTrigger>アカウント</PopoverTrigger>
            <PopoverContent aria-label="アカウント">
              <span id="inside">中身</span>
              <a href="#settings">設定</a>
            </PopoverContent>
          </Popover>
        </div>
      )
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const trigger = () => container.querySelector("button")!;
  const content = () => container.querySelector('[aria-label="アカウント"]');

  it("閉じた状態では中身を出さず、ボタンの aria-expanded が false", () => {
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("type")).toBe("button");
    expect(content()).toBeNull();
  });

  it("ボタンを押すと開き、aria-expanded が true になり、aria-controls が中身の id を指す", () => {
    act(() => trigger().click());

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(content()).not.toBeNull();
    expect(trigger().getAttribute("aria-controls")).toBe(content()!.id);
  });

  it("開いた状態でもう一度押すと閉じる", () => {
    act(() => trigger().click());
    act(() => trigger().click());

    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(content()).toBeNull();
  });

  it("Escape で閉じ、フォーカスをボタンに戻す", () => {
    act(() => trigger().click());
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(content()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("外側を押すと閉じ、中身を押しても閉じない", () => {
    act(() => trigger().click());
    act(() => {
      container
        .querySelector("#inside")!
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(content()).not.toBeNull();

    act(() => {
      container
        .querySelector("#outside")!
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(content()).toBeNull();
  });

  it("中のリンクを押すと閉じる（同じレイアウトのまま画面が移っても開いたままにしない）", () => {
    act(() => trigger().click());
    act(() => {
      (
        container.querySelector('a[href="#settings"]') as HTMLAnchorElement
      ).click();
    });

    expect(content()).toBeNull();
  });
});
