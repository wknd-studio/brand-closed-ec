// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Cart } from "@/lib/cart/types";

const signOut = vi.fn();
let pathname = "/shop";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut }),
  useAuth: () => ({ isLoaded: true }),
}));

import Header from "@/components/header";
import { CartProvider } from "@/components/cart/cart-provider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT = {
  name: "山田 花子",
  email: "info+test_member@example.com",
  planName: "スタンダード",
};

const CART: Cart = {
  items: [
    {
      productId: "p1",
      productName: "商品1",
      thumbnail: null,
      unitPrice: 100_000,
      quantity: 1,
      availability: "available",
      paymentTiming: "at_order",
    },
    {
      productId: "p2",
      productName: "商品2",
      thumbnail: null,
      unitPrice: 49_500,
      quantity: 1,
      availability: "available",
      paymentTiming: "at_order",
    },
  ],
};

describe("会員のヘッダー", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pathname = "/shop";
    signOut.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render({
    account = ACCOUNT,
    cart = CART,
    monthlyLimit = 5_000_000,
  }: {
    account?: typeof ACCOUNT | null;
    cart?: Cart;
    monthlyLimit?: number | null;
  } = {}) {
    act(() =>
      root.render(
        <CartProvider
          confirmedAmount={1_090_500}
          monthlyLimit={monthlyLimit}
          initialCart={cart}
        >
          <Header account={account} />
        </CartProvider>
      )
    );
  }

  const desktop = () => container.querySelector("[data-header='desktop']")!;
  const mobile = () => container.querySelector("[data-header='mobile']")!;
  const buttonByText = (scope: Element, text: string) =>
    [...scope.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(text)
    );

  describe("パソコン幅", () => {
    it("ロゴ・ナビ・検索欄・仕入れ枠・カート・アカウントの順に並べる", () => {
      render();

      const logo = desktop().querySelector("a[href='/shop'] img");
      expect(logo?.getAttribute("alt")).toBe("EQ MART");
      const navLinks = [...desktop().querySelectorAll("nav a")].map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ]);
      expect(navLinks).toEqual([
        ["ショップ", "/shop"],
        ["お気に入り", "/favorites"],
        ["注文履歴", "/orders"],
      ]);

      const order = [
        desktop().querySelector("a[aria-label$='ショップのトップへ']"),
        desktop().querySelector("nav"),
        desktop().querySelector("form[role='search']"),
        buttonByText(desktop(), "今月の仕入れ枠"),
        desktop().querySelector("button[aria-label^='カートを開く']"),
        buttonByText(desktop(), "アカウント"),
      ];
      order.forEach((el) => expect(el).toBeTruthy());
      for (let i = 1; i < order.length; i++) {
        expect(
          order[i - 1]!.compareDocumentPosition(order[i]!) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      }
    });

    it.each([
      ["/shop", "ショップ"],
      ["/shop/search", "ショップ"],
      ["/favorites", "お気に入り"],
      ["/orders/abc", "注文履歴"],
    ])("%s では「%s」に aria-current='page' を付ける", (path, label) => {
      pathname = path;
      render();

      const current = [...desktop().querySelectorAll("nav a")]
        .filter((a) => a.getAttribute("aria-current") === "page")
        .map((a) => a.textContent);
      expect(current).toEqual([label]);
    });

    it("設定の画面では、ナビのどれにも aria-current を付けない", () => {
      pathname = "/settings";
      render();

      expect(desktop().querySelector("nav a[aria-current]")).toBeNull();
    });

    it("検索欄は /shop/search へキーワード（q）を送る", () => {
      render();

      const form = desktop().querySelector("form[role='search']")!;
      expect(form.getAttribute("action")).toBe("/shop/search");
      expect(form.getAttribute("method") ?? "get").toBe("get");
      expect(
        form.querySelector("input[type='search']")?.getAttribute("name")
      ).toBe("q");
    });

    it("仕入れ枠に上限・残り・使用を出し、押すと内訳を出す", () => {
      render();

      const limit = buttonByText(desktop(), "今月の仕入れ枠")!;
      expect(limit.textContent).toContain("上限 ¥5,000,000");
      expect(limit.textContent).toContain("残り ¥3,760,000");
      expect(limit.textContent).toContain("使用 ¥1,240,000");
      expect(limit.getAttribute("aria-expanded")).toBe("false");

      act(() => limit.click());

      expect(limit.getAttribute("aria-expanded")).toBe("true");
      const detail = document.getElementById(
        limit.getAttribute("aria-controls")!
      )!;
      expect(detail.textContent).toContain("上限（スタンダード）");
      expect(detail.textContent).toContain("確定した注文¥1,090,500");
      expect(detail.textContent).toContain("カートの商品¥149,500");
    });

    it("カートのボタンに件数のバッジを付ける", () => {
      render();

      const cart = desktop().querySelector(
        "button[aria-label^='カートを開く']"
      )!;
      expect(cart.getAttribute("aria-label")).toBe("カートを開く（2種類）");
      expect(cart.textContent).toBe("2");
    });

    it("カートが空ならバッジを出さない", () => {
      render({ cart: { items: [] } });

      const cart = desktop().querySelector(
        "button[aria-label^='カートを開く']"
      )!;
      expect(cart.getAttribute("aria-label")).toBe("カートを開く（空）");
      expect(cart.textContent).toBe("");
    });

    it("アカウントのメニューに、氏名・メールアドレス・プラン名、設定へのリンク、ログアウトを出す", () => {
      render();

      const accountButton = buttonByText(desktop(), "アカウント")!;
      expect(accountButton.getAttribute("aria-expanded")).toBe("false");
      act(() => accountButton.click());
      expect(accountButton.getAttribute("aria-expanded")).toBe("true");

      const menu = document.getElementById(
        accountButton.getAttribute("aria-controls")!
      )!;
      expect(menu.textContent).toContain("山田 花子");
      expect(menu.textContent).toContain("info+test_member@example.com");
      expect(menu.textContent).toContain("スタンダードプラン");
      expect(menu.querySelector("a[href='/settings']")).not.toBeNull();

      act(() => buttonByText(menu, "ログアウト")!.click());
      expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    });
  });

  describe("スマホ幅", () => {
    it("1行目はロゴ・検索・カート・メニューのボタンだけにし、その下に仕入れ枠の帯を出す", () => {
      render();

      expect(mobile().querySelector("a[href='/shop'] img")).not.toBeNull();
      expect(
        mobile()
          .querySelector("a[href='/shop/search']")
          ?.getAttribute("aria-label")
      ).toBe("商品を検索");
      expect(
        mobile().querySelector("button[aria-label^='カートを開く']")
      ).not.toBeNull();
      expect(
        mobile().querySelector("button[aria-label='メニューを開く']")
      ).not.toBeNull();
      expect(mobile().querySelector("nav")).toBeNull();

      const band = mobile().querySelector("[aria-label='今月の仕入れ枠']")!;
      expect(band.textContent).toContain("残り ¥3,760,000");
      expect(band.textContent).toContain("（うちカート ¥149,500）");
    });

    it("メニューを開くと、ナビ・アカウント・設定・ログアウトを出し、aria-expanded が状態に合う", () => {
      pathname = "/favorites";
      render();

      const menuButton = mobile().querySelector<HTMLButtonElement>(
        "button[aria-label='メニューを開く']"
      )!;
      expect(menuButton.getAttribute("aria-expanded")).toBe("false");
      act(() => menuButton.click());

      expect(menuButton.getAttribute("aria-expanded")).toBe("true");
      expect(menuButton.getAttribute("aria-label")).toBe("メニューを閉じる");
      const menu = document.getElementById(
        menuButton.getAttribute("aria-controls")!
      )!;
      expect(
        [...menu.querySelectorAll("nav a")].map((a) => [
          a.textContent,
          a.getAttribute("aria-current"),
        ])
      ).toEqual([
        ["ショップ", null],
        ["お気に入り", "page"],
        ["注文履歴", null],
      ]);
      expect(menu.textContent).toContain("山田 花子");
      expect(menu.textContent).toContain("スタンダードプラン");
      expect(menu.querySelector("a[href='/settings']")).not.toBeNull();
      expect(buttonByText(menu, "ログアウト")).toBeDefined();

      act(() => menuButton.click());
      expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("無制限のプランは、仕入れ枠にバーを出さず「上限なし」と出す", () => {
    render({ monthlyLimit: null });

    const limit = buttonByText(desktop(), "今月の仕入れ枠")!;
    expect(limit.textContent).toContain("上限なし");
    expect(limit.querySelector("[data-segment]")).toBeNull();
  });

  it("会員の情報が無ければ、ロゴだけを出す", () => {
    render({ account: null });

    expect(desktop().querySelector("a[href='/shop'] img")).not.toBeNull();
    expect(desktop().querySelector("nav")).toBeNull();
    expect(buttonByText(desktop(), "アカウント")).toBeUndefined();
  });
});
