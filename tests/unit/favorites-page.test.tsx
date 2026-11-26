// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  FavoriteProductDto,
  ProductCardDto,
} from "@/queries/catalog-query-service";

const { findFavorites, findFavoriteProducts } = vi.hoisted(() => ({
  findFavorites: vi.fn(),
  findFavoriteProducts: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_1" })),
}));
vi.mock("@/composition/member-query", () => ({
  memberQueryService: async () => ({ findFavorites }),
}));
vi.mock("@/composition/catalog-query", () => ({
  catalogQueryService: () => ({ findFavoriteProducts }),
}));
vi.mock("@/components/favorites/favorites-provider", () => ({
  useFavorites: () => ({ isFavorited: () => true, toggleFavorite: vi.fn() }),
}));

import FavoritesPage from "@/app/(member)/favorites/page";

function toDocument(element: ReactElement): Document {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(element),
    "text/html"
  );
}

function product(overrides: Partial<ProductCardDto> = {}): ProductCardDto {
  return {
    id: "prod-1",
    name: "レザートートバッグ",
    brand: "Brand A",
    retailPrice: 48000,
    isNegotiable: false,
    unitPrice: 31200,
    availability: "available",
    thumbnail: null,
    paymentTiming: "at_order",
    ...overrides,
  };
}

const ITEMS: FavoriteProductDto[] = [
  { product: product(), isAccessible: true },
  {
    product: product({
      id: "prod-2",
      name: "ドリップコーヒー 30袋",
      brand: "Brand D",
      unitPrice: null,
    }),
    isAccessible: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  findFavorites.mockResolvedValue({
    rank: { value: "standard" },
    favoriteProductIds: ["prod-1", "prod-2"],
  });
  findFavoriteProducts.mockResolvedValue(ITEMS);
});

describe("/favorites（お気に入り）", () => {
  it("Eyebrow「MY PAGE」・明朝の見出し「お気に入り」・件数を出す", async () => {
    const doc = toDocument(await FavoritesPage());

    expect(doc.body.textContent).toContain("MY PAGE");
    const h1 = doc.querySelector("h1");
    expect(h1?.textContent).toBe("お気に入り");
    expect(h1?.className).toContain("font-display");
    expect(doc.body.textContent).toContain("2点の商品");
  });

  it("商品を商品カードで、パソコン幅は4列・スマホ幅は2列に並べ、ブランド名を出す", async () => {
    const doc = toDocument(await FavoritesPage());

    const grid = doc.querySelector("ul")!;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
    const cards = grid.querySelectorAll("li");
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector("[data-product-image]")).not.toBeNull();
    expect(cards[0].textContent).toContain("Brand A");
  });

  it("見られる商品は、商品詳細へのリンクにし、価格を出す", async () => {
    const doc = toDocument(await FavoritesPage());

    const card = doc.querySelectorAll("li")[0];
    expect(card.querySelector("a")?.getAttribute("href")).toBe(
      "/shop/Brand%20A/prod-1"
    );
    expect(card.textContent).toContain("¥31,200");
  });

  it("今のプランで見られない商品は、鍵の覆いを出し、価格を出さず、リンクにしない", async () => {
    const doc = toDocument(await FavoritesPage());

    const card = doc.querySelectorAll("li")[1];
    expect(card.querySelector("a")).toBeNull();
    expect(card.querySelector("[data-locked-veil]")?.textContent).toBe(
      "今のプランではご覧いただけません"
    );
    expect(card.textContent).not.toContain("¥");
  });

  it("どの商品にも、お気に入りから外すハート（FavoriteButton）を置く", async () => {
    const doc = toDocument(await FavoritesPage());

    for (const card of doc.querySelectorAll("li")) {
      const button = card.querySelector('button[aria-pressed="true"]');
      expect(button?.getAttribute("aria-label")).toBe("お気に入りから削除");
      expect(button?.closest("a")).toBeNull();
    }
  });

  it("0件のときは、案内と「ショップを見る」を出し、件数・一覧を出さない", async () => {
    findFavoriteProducts.mockResolvedValue([]);
    const doc = toDocument(await FavoritesPage());

    expect(doc.body.textContent).toContain(
      "お気に入りに登録した商品はありません"
    );
    expect(doc.body.textContent).toContain(
      "商品のハートを押すと、ここに集まります。"
    );
    const link = [...doc.querySelectorAll("a")].find(
      (a) => a.textContent === "ショップを見る"
    );
    expect(link?.getAttribute("href")).toBe("/shop");
    expect(doc.body.textContent).not.toContain("点の商品");
    expect(doc.querySelector("ul")).toBeNull();
  });
});
