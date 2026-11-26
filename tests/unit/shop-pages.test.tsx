// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { ProductCardDto } from "@/queries/catalog-query-service";

const { findBrands, findProducts, findBrandTheme, fetchMoreProducts } =
  vi.hoisted(() => ({
    findBrands: vi.fn(),
    findProducts: vi.fn(),
    findBrandTheme: vi.fn(),
    fetchMoreProducts: vi.fn(),
  }));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({ userId: "user_1" })),
}));
vi.mock("@/app/(member)/shop/member-rank", () => ({
  findShopMemberRank: vi.fn(async () => MemberRank.of("standard")),
}));
vi.mock("@/composition/catalog-query", () => ({
  catalogQueryService: () => ({ findBrands, findProducts }),
}));
vi.mock("@/composition/brand-theme-query", () => ({
  brandThemeQueryService: () => ({ findBrandTheme }),
}));
vi.mock("@/app/(member)/shop/[brand]/actions", () => ({ fetchMoreProducts }));
vi.mock("@/components/favorites/favorites-provider", () => ({
  useFavorites: () => ({ isFavorited: () => false, toggleFavorite: vi.fn() }),
}));

import ShopPage from "@/app/(member)/shop/page";
import BrandProductsPage from "@/app/(member)/shop/[brand]/page";
import ProductGrid from "@/app/(member)/shop/[brand]/product-grid";
import SearchPage from "@/app/(member)/shop/search/page";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const THEME = {
  primaryColorHex: "#1f3a5f",
  accentColorHex: "#e8c766",
  font: "playfair",
  bannerUrl: "https://cdn.example/banner.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
  findBrandTheme.mockResolvedValue(null);
  findProducts.mockResolvedValue({ products: [], total: 0 });
});

describe("/shop（ブランドから探す）", () => {
  beforeEach(() => {
    findBrands.mockResolvedValue([
      {
        brand: "Brand A",
        count: 128,
        thumbnail: "https://cdn.example/a.jpg",
      },
      { brand: "Brand B", count: 64, thumbnail: null },
    ]);
  });

  it("Eyebrow「MEMBERS SHOP」と明朝の見出し「ブランドから探す」を出す", async () => {
    const doc = toDocument(await ShopPage());

    expect(doc.body.textContent).toContain("MEMBERS SHOP");
    const h1 = doc.querySelector("h1");
    expect(h1?.textContent).toBe("ブランドから探す");
    expect(h1?.className).toContain("font-display");
  });

  it("どのプランの会員価格を表示しているかを書く", async () => {
    const doc = toDocument(await ShopPage());

    expect(doc.body.textContent).toContain(
      "表示している価格は、STANDARD（標準）プランの会員価格です。"
    );
  });

  it("ブランドを縦長（4:5）のカードで、パソコン幅は4列・スマホ幅は2列に並べ、ブランド名・点数を出す", async () => {
    const doc = toDocument(await ShopPage());

    const links = [...doc.querySelectorAll('a[href^="/shop/Brand"]')];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/shop/Brand%20A",
      "/shop/Brand%20B",
    ]);
    expect(links[0].textContent).toContain("Brand A");
    expect(links[0].textContent).toContain("128点");
    expect(links[1].textContent).toContain("64点");
    expect(links[0].querySelector(".aspect-4\\/5")).not.toBeNull();

    const grid = links[0].parentElement!;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
  });

  it("スマホ幅では、ページの上に検索欄を出す", async () => {
    const doc = toDocument(await ShopPage());

    const form = doc.querySelector('form[role="search"]');
    expect(form?.getAttribute("action")).toBe("/shop/search");
    expect(form?.className).toContain("md:hidden");
    expect(form?.querySelector('input[name="q"]')).not.toBeNull();
  });

  it("表示できるブランドが無ければ、その旨を出す", async () => {
    findBrands.mockResolvedValue([]);
    const doc = toDocument(await ShopPage());

    expect(doc.body.textContent).toContain("表示できるブランドがありません");
  });
});

describe("/shop/[brand]（ブランドのページ）", () => {
  async function render() {
    return toDocument(
      await BrandProductsPage({
        params: Promise.resolve({ brand: "Brand%20A" }),
      })
    );
  }

  beforeEach(() => {
    findProducts.mockResolvedValue({ products: [product()], total: 128 });
  });

  it("パンくず（ショップ / ブランド名）を出す", async () => {
    const doc = await render();

    const nav = doc.querySelector('nav[aria-label="パンくずリスト"]');
    expect(nav?.querySelector('a[href="/shop"]')?.textContent).toBe("ショップ");
    expect(nav?.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Brand A"
    );
  });

  it("テーマのあるブランドは、バナーと見出しにテーマの色・フォント・バナー画像を使う", async () => {
    findBrandTheme.mockResolvedValue(THEME);
    const doc = await render();

    const banner = doc.querySelector("[data-brand-banner]") as HTMLElement;
    expect(banner.getAttribute("style")).toContain("--brand-primary:#1f3a5f");
    expect(banner.className).toContain("bg-brand-primary");
    expect(banner.querySelector("img")?.getAttribute("src")).toContain(
      encodeURIComponent("https://cdn.example/banner.jpg")
    );
    const h1 = banner.querySelector("h1");
    expect(h1?.textContent).toBe("Brand A");
    expect(h1?.className).toContain("font-brand");
  });

  it("テーマが無いブランドは、EQ×Mart の色と明朝の見出しで出す", async () => {
    const doc = await render();

    const banner = doc.querySelector("[data-brand-banner]") as HTMLElement;
    expect(banner.getAttribute("style") ?? "").not.toContain("--brand-primary");
    expect(banner.className).toContain("from-primary-light");
    expect(banner.className).not.toContain("bg-brand-primary");
    expect(banner.querySelector("img")).toBeNull();
    expect(banner.querySelector("h1")?.className).toContain("font-display");
  });

  it("「すべての商品 ◯点」と、価格がどのプランの会員価格かを出す", async () => {
    const doc = await render();

    const h2 = doc.querySelector("h2");
    expect(h2?.textContent?.replace(/\s+/g, "")).toBe("すべての商品128点");
    expect(doc.body.textContent).toContain(
      "価格は STANDARD（標準）プランの会員価格です"
    );
  });

  it("表示できる商品が無ければ、その旨を出す", async () => {
    findProducts.mockResolvedValue({ products: [], total: 0 });
    const doc = await render();

    expect(doc.body.textContent).toContain("表示できる商品がありません");
  });
});

describe("商品の一覧（無限スクロール）", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("商品をパソコン幅は4列・スマホ幅は2列に並べ、行の間を列の間より広くとる", () => {
    act(() =>
      root.render(<ProductGrid initialProducts={[product()]} total={1} />)
    );

    const grid = container.querySelector("ul")!;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
    expect(grid.className).toMatch(/gap-y-\d+/);
    expect(grid.querySelectorAll(":scope > li")).toHaveLength(1);
  });

  it("続きがあるときは、表示中の点数と「続きを読み込みます」を出す", () => {
    act(() =>
      root.render(<ProductGrid initialProducts={[product()]} total={13} />)
    );

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe(
      "1点を表示中・下へスクロールすると続きを読み込みます"
    );
  });

  it("すべて表示したら「すべての商品を表示しました」を出す", () => {
    act(() =>
      root.render(<ProductGrid initialProducts={[product()]} total={1} />)
    );

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe("すべての商品を表示しました");
  });

  it("請求書払い（注文後払い）・在庫切れの商品は、カードにその旨を出す", () => {
    act(() =>
      root.render(
        <ProductGrid
          initialProducts={[
            product({ id: "a", paymentTiming: "after_order" }),
            product({ id: "b", availability: "out_of_stock" }),
          ]}
          total={2}
        />
      )
    );

    const [invoice, outOfStock] = [...container.querySelectorAll("li")];
    expect(invoice.textContent).toContain("請求書払い");
    expect(invoice.textContent).not.toContain("在庫切れ");
    expect(outOfStock.textContent).toContain("在庫切れ");
    expect(outOfStock.textContent).not.toContain("請求書払い");
  });
});

describe("/shop/search（商品を検索）", () => {
  async function render(q?: string) {
    return toDocument(
      await SearchPage({ searchParams: Promise.resolve({ q }) })
    );
  }

  it("見出しと検索欄を出す", async () => {
    const doc = await render();

    expect(doc.querySelector("h1")?.textContent).toBe("商品を検索");
    const form = doc.querySelector('form[role="search"]');
    expect(form?.getAttribute("action")).toBe("/shop/search");
    expect(form?.querySelector('input[name="q"]')).not.toBeNull();
    expect(form?.querySelector('button[type="submit"]')?.textContent).toBe(
      "検索する"
    );
    expect(findProducts).not.toHaveBeenCalled();
    expect(doc.querySelector('[role="status"]')).toBeNull();
  });

  it("「『◯◯』の検索結果 ◯件」と、結果の商品を出す", async () => {
    findProducts.mockResolvedValue({ products: [product()], total: 3 });
    const doc = await render(" バッグ ");

    expect(doc.querySelector('input[name="q"]')?.getAttribute("value")).toBe(
      "バッグ"
    );
    expect(doc.body.textContent).toContain("「バッグ」の検索結果 3件");
    expect(doc.body.textContent).toContain("レザートートバッグ");
  });

  it("0件のときは、ブランドから探すへの導線を出す", async () => {
    const doc = await render("ベルト");

    expect(doc.body.textContent).toContain(
      "「ベルト」に一致する商品はありません"
    );
    const link = [...doc.querySelectorAll("main a")].find(
      (a) => a.textContent === "ブランドから探す"
    );
    expect(link?.getAttribute("href")).toBe("/shop");
  });
});
