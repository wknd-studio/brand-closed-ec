// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Breadcrumb } from "@/components/ui/breadcrumb";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { label: "ショップ", href: "/shop" },
  { label: "Brand A", href: "/brands/brand-a" },
  { label: "レザートートバッグ" },
];

describe("Breadcrumb", () => {
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

  it("「パンくずリスト」の nav の中の ol に、上の階層から並べる", () => {
    act(() => root.render(<Breadcrumb items={ITEMS} />));

    const nav = container.querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("パンくずリスト");
    const items = [...container.querySelectorAll("nav > ol > li")];
    expect(items.map((li) => li.textContent?.replace("/", ""))).toEqual([
      "ショップ",
      "Brand A",
      "レザートートバッグ",
    ]);
  });

  it('上の階層はリンクにし、今のページ（最後）はリンクにせず aria-current="page" を付ける', () => {
    act(() => root.render(<Breadcrumb items={ITEMS} />));

    const links = [...container.querySelectorAll("nav a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/shop",
      "/brands/brand-a",
    ]);
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("レザートートバッグ");
    expect(current[0].closest("a")).toBeNull();
  });

  it("区切りの記号は読み上げない", () => {
    act(() => root.render(<Breadcrumb items={ITEMS} />));

    const separators = [...container.querySelectorAll('[aria-hidden="true"]')];
    expect(separators.map((el) => el.textContent)).toEqual(["/", "/"]);
  });
});
