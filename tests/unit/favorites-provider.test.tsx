// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  FavoritesProvider,
  useFavorites,
} from "@/components/favorites/favorites-provider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Favorites = ReturnType<typeof useFavorites>;

function Probe({ onRender }: { onRender: (value: Favorites) => void }) {
  onRender(useFavorites());
  return null;
}

describe("FavoritesProvider", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: Favorites;
  const addFavorite = vi.fn<(sanityProductId: string) => Promise<void>>();
  const removeFavorite = vi.fn<(sanityProductId: string) => Promise<void>>();

  function render(initialFavoriteIds: string[]) {
    act(() => {
      root.render(
        <FavoritesProvider
          initialFavoriteIds={initialFavoriteIds}
          addFavorite={addFavorite}
          removeFavorite={removeFavorite}
        >
          <Probe onRender={(value) => (latest = value)} />
        </FavoritesProvider>
      );
    });
  }

  beforeEach(() => {
    addFavorite.mockReset().mockResolvedValue(undefined);
    removeFavorite.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("お気に入りでない商品を切り替えると、追加の関数が商品IDで呼ばれ、直後にお気に入りになる", () => {
    render([]);
    expect(latest.isFavorited("product-1")).toBe(false);

    act(() => latest.toggleFavorite("product-1"));

    expect(addFavorite).toHaveBeenCalledExactlyOnceWith("product-1");
    expect(removeFavorite).not.toHaveBeenCalled();
    expect(latest.isFavorited("product-1")).toBe(true);
  });

  it("お気に入りの商品を切り替えると、削除の関数が商品IDで呼ばれ、直後にお気に入りでなくなる", () => {
    render(["product-1"]);
    expect(latest.isFavorited("product-1")).toBe(true);

    act(() => latest.toggleFavorite("product-1"));

    expect(removeFavorite).toHaveBeenCalledExactlyOnceWith("product-1");
    expect(addFavorite).not.toHaveBeenCalled();
    expect(latest.isFavorited("product-1")).toBe(false);
  });

  it("Provider の外で useFavorites を使うとエラーになる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      act(() => root.render(<Probe onRender={() => {}} />))
    ).toThrow("useFavorites must be used within FavoritesProvider");
  });
});
