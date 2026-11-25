// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const { isFavorited, toggleFavorite } = vi.hoisted(() => ({
  isFavorited: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock("@/components/favorites/favorites-provider", () => ({
  useFavorites: () => ({ isFavorited, toggleFavorite }),
}));

import FavoriteButton from "@/components/favorite-button";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FavoriteButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("ハートのアイコンだけのボタンで、押せる範囲を40px以上にする", () => {
    isFavorited.mockReturnValue(false);
    act(() => root.render(<FavoriteButton sanityProductId="prod-1" />));

    const button = container.querySelector("button")!;
    expect(button.className).toContain("size-10");
    expect(button.querySelector("svg path")).not.toBeNull();
    expect(button.textContent).toBe("");
  });

  it("お気に入りでない商品は「お気に入りに追加」で、押すとお気に入りを切り替える", () => {
    isFavorited.mockReturnValue(false);
    act(() => root.render(<FavoriteButton sanityProductId="prod-1" />));

    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("お気に入りに追加");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.querySelector("svg")?.getAttribute("fill")).toBe("none");

    act(() => button.click());
    expect(toggleFavorite).toHaveBeenCalledWith("prod-1");
  });

  it("お気に入りの商品は「お気に入りから削除」で、ハートを塗りつぶす", () => {
    isFavorited.mockReturnValue(true);
    act(() => root.render(<FavoriteButton sanityProductId="prod-1" />));

    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("お気に入りから削除");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.querySelector("svg")?.getAttribute("fill")).toBe(
      "currentColor"
    );
  });
});
