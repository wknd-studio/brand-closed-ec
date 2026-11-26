// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import CartSidebar from "@/components/cart-sidebar";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import type { Cart, CartItem } from "@/lib/cart/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function item(overrides: Partial<CartItem> & { productId: string }): CartItem {
  return {
    productName: overrides.productId,
    thumbnail: null,
    unitPrice: 10_000,
    quantity: 1,
    availability: "available",
    paymentTiming: "at_order",
    ...overrides,
  };
}

const TOTE = item({
  productId: "tote",
  productName: "レザートートバッグ",
  unitPrice: 31_200,
});
const SHIRT = item({
  productId: "shirt",
  productName: "コットンオックスフォードシャツ",
  unitPrice: 11_700,
  quantity: 4,
});
const LOAFER = item({
  productId: "loafer",
  productName: "スエードローファー",
  unitPrice: null,
  quantity: 2,
});
const PANTS = item({
  productId: "pants",
  productName: "リネンワイドパンツ",
  unitPrice: 14_300,
  quantity: 5,
  paymentTiming: "after_order",
});

const MIXED: Cart = { items: [TOTE, SHIRT, LOAFER, PANTS] };

function OpenButton() {
  const { openCart } = useCart();
  return (
    <button type="button" data-testid="open" onClick={openCart}>
      開く
    </button>
  );
}

describe("カートのサイドバー", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.cookie = "cart=; max-age=0; path=/";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render({
    cart = MIXED,
    confirmedAmount = 1_240_000,
    monthlyLimit = 5_000_000,
    open = true,
  }: {
    cart?: Cart;
    confirmedAmount?: number;
    monthlyLimit?: number | null;
    open?: boolean;
  } = {}) {
    act(() =>
      root.render(
        <CartProvider
          initialCart={cart}
          confirmedAmount={confirmedAmount}
          monthlyLimit={monthlyLimit}
        >
          <OpenButton />
          <CartSidebar />
        </CartProvider>
      )
    );
    if (open) {
      act(() =>
        container
          .querySelector<HTMLButtonElement>("[data-testid=open]")!
          .click()
      );
    }
  }

  const dialog = () =>
    container.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']")!;
  const buttonByText = (scope: Element, text: string) =>
    [...scope.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === text
    );
  const row = (name: string) =>
    [...dialog().querySelectorAll("li")].find((li) =>
      li.textContent?.includes(name)
    )!;

  describe("開閉", () => {
    it("dialog（aria-modal）として開き、見出し「カート ◯種類」を名前にする", () => {
      render();

      const el = dialog();
      expect(el).toBeTruthy();
      const title = document.getElementById(
        el.getAttribute("aria-labelledby")!
      )!;
      expect(title.tagName).toBe("H2");
      expect(title.textContent).toBe("カート4種類");
      expect(el.hasAttribute("inert")).toBe(false);
    });

    it("閉じているときは inert にして、操作・読み上げの対象から外す", () => {
      render({ open: false });

      expect(dialog().hasAttribute("inert")).toBe(true);
    });

    it("閉じるボタンで閉じる", () => {
      render();

      act(() =>
        dialog()
          .querySelector<HTMLButtonElement>("[aria-label='カートを閉じる']")!
          .click()
      );
      expect(dialog().hasAttribute("inert")).toBe(true);
    });

    it("Esc で閉じる", () => {
      render();

      act(() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
      });
      expect(dialog().hasAttribute("inert")).toBe(true);
    });

    it("パソコン幅は右から幅440pxで出し、スマホ幅は全面で出す", () => {
      render();

      expect(dialog().className).toContain("w-full");
      expect(dialog().className).toContain("sm:w-[440px]");
      expect(dialog().className).toContain("right-0");
    });
  });

  describe("商品", () => {
    it("カード・請求書に分け、それぞれ小計を出す", () => {
      render();

      const sections = [...dialog().querySelectorAll("section")];
      expect(sections).toHaveLength(2);
      const [card, invoice] = sections;
      expect(card.querySelector("h3")?.textContent).toBe(
        "カード注文時に支払う商品"
      );
      expect(card.textContent).toContain("小計 ¥78,000");
      expect(card.querySelectorAll("li")).toHaveLength(3);
      expect(invoice.querySelector("h3")?.textContent).toBe(
        "請求書注文後に請求される商品"
      );
      expect(invoice.textContent).toContain("小計 ¥71,500");
      expect(invoice.querySelectorAll("li")).toHaveLength(1);
    });

    it("支払い方法が1種類だけなら、分けずに並べる", () => {
      render({ cart: { items: [TOTE, SHIRT] } });

      expect(dialog().querySelectorAll("section")).toHaveLength(0);
      expect(dialog().querySelectorAll("li")).toHaveLength(2);
    });

    it("各商品に、4:5のサムネイル・商品名・単価・数量・行の小計・削除を出す", () => {
      render();

      const shirt = row("コットンオックスフォードシャツ");
      expect(shirt.querySelector("[data-thumbnail]")?.className).toContain(
        "aspect-[4/5]"
      );
      expect(shirt.textContent).toContain("¥11,700 / 点");
      expect(shirt.textContent).toContain("¥46,800");
      const qty = shirt.querySelector("[role='group']")!;
      expect(qty.getAttribute("aria-label")).toBe(
        "コットンオックスフォードシャツの数量"
      );
      expect(qty.textContent).toContain("4");
      // 押せる範囲 40px 以上（QuantityStepper の sm）
      expect(
        qty.querySelector("[aria-label='数量を増やす']")?.className
      ).toContain("h-10");
      expect(
        shirt.querySelector(
          "[aria-label='コットンオックスフォードシャツをカートから削除']"
        )?.className
      ).toContain("h-10");
    });

    it("価格要相談の商品は、単価を「価格要相談」、行の小計を「要相談」にする", () => {
      render();

      const loafer = row("スエードローファー");
      expect(loafer.textContent).toContain("価格要相談");
      expect(loafer.textContent).toContain("要相談");
    });

    it("数量を変えると、行の小計・グループの小計が変わる", () => {
      render();

      act(() =>
        row("レザートートバッグ")
          .querySelector<HTMLButtonElement>("[aria-label='数量を増やす']")!
          .click()
      );
      expect(row("レザートートバッグ").textContent).toContain("¥62,400");
      expect(dialog().querySelector("section")!.textContent).toContain(
        "小計 ¥109,200"
      );
    });

    it("削除を押すとカートから消える", () => {
      render();

      act(() =>
        row("レザートートバッグ")
          .querySelector<HTMLButtonElement>(
            "[aria-label='レザートートバッグをカートから削除']"
          )!
          .click()
      );
      expect(dialog().textContent).not.toContain("レザートートバッグ");
    });

    it("上限を超えて増やせないときは、その商品の下にエラー文言を出し、減らすと消す", () => {
      // 残り ¥10,000 で、シャツ（¥11,700）を1つ増やせない
      render({ confirmedAmount: 5_000_000 - 149_500 - 10_000 });

      const shirt = () => row("コットンオックスフォードシャツ");
      act(() =>
        shirt()
          .querySelector<HTMLButtonElement>("[aria-label='数量を増やす']")!
          .click()
      );
      const error = shirt().querySelector("[role='alert']");
      expect(error?.textContent).toContain(
        "月間仕入れ上限（¥5,000,000）を超えるため変更できません"
      );
      expect(
        shirt().querySelector("[role='group'] [aria-live]")?.textContent
      ).toBe("4");
      // 別の商品には出さない
      expect(
        row("レザートートバッグ").querySelector("[role='alert']")
      ).toBeNull();

      act(() =>
        shirt()
          .querySelector<HTMLButtonElement>("[aria-label='数量を減らす']")!
          .click()
      );
      expect(shirt().querySelector("[role='alert']")).toBeNull();
    });

    it("在庫切れの商品は、増やせないが減らせる", () => {
      render({
        cart: {
          items: [{ ...SHIRT, availability: "out_of_stock" }],
        },
      });

      const shirt = row("コットンオックスフォードシャツ");
      expect(
        shirt.querySelector<HTMLButtonElement>("[aria-label='数量を増やす']")!
          .disabled
      ).toBe(true);
      expect(
        shirt.querySelector<HTMLButtonElement>("[aria-label='数量を減らす']")!
          .disabled
      ).toBe(false);
    });
  });

  describe("下の固定部分", () => {
    it("仕入れ枠の残り（このカートを含む）を、ヘッダーと同じ部品で出す", () => {
      render();

      const limit = dialog().querySelector("[aria-label='今月の仕入れ枠']")!;
      expect(limit.textContent).toContain("今月の仕入れ枠");
      expect(limit.textContent).toContain("上限 ¥5,000,000");
      expect(limit.textContent).toContain("残り ¥3,610,500");
      expect(limit.textContent).toContain("（うちカート ¥149,500）");
    });

    it("会員の情報が無い（上限0）ときは仕入れ枠を出さない", () => {
      render({ monthlyLimit: 0, confirmedAmount: 0 });

      expect(
        dialog().querySelector("[aria-label='今月の仕入れ枠']")
      ).toBeNull();
    });

    it("合計（価格要相談を除く）と、その旨の注記を出す", () => {
      render();

      const footer = dialog().querySelector("[data-cart-footer]")!;
      expect(footer.textContent).toContain("合計¥149,500");
      expect(footer.textContent).toContain(
        "価格要相談の商品は、合計に含まれません"
      );
    });

    it("「注文手続きへ」はゴールドのボタンで注文手続きへ進み、カートを閉じる", () => {
      render();

      const link = [...dialog().querySelectorAll("a")].find((a) =>
        a.textContent?.includes("注文手続きへ")
      )!;
      expect(link.getAttribute("href")).toBe("/order/checkout");
      expect(link.className).toContain("from-primary-light");
      act(() => link.click());
      expect(dialog().hasAttribute("inert")).toBe(true);
    });

    it("「カートを空にする」は確認してから空にし、空のときの表示に変える", () => {
      render();

      act(() => buttonByText(dialog(), "カートを空にする")!.click());
      const confirm = container.querySelector(
        "[role='alertdialog']"
      ) as HTMLElement;
      expect(confirm.textContent).toContain("カートをすべて削除しますか？");

      act(() => buttonByText(confirm, "キャンセル")!.click());
      expect(container.querySelector("[role='alertdialog']")).toBeNull();
      expect(dialog().querySelectorAll("li")).toHaveLength(4);

      act(() => buttonByText(dialog(), "カートを空にする")!.click());
      act(() =>
        buttonByText(
          container.querySelector("[role='alertdialog']")!,
          "削除する"
        )!.click()
      );
      expect(dialog().querySelectorAll("li")).toHaveLength(0);
      expect(dialog().textContent).toContain("カートは空です");
    });
  });

  describe("空のとき", () => {
    it("「カートは空です」と「ショップを見る」を出し、種類の数と下の固定部分は出さない", () => {
      render({ cart: { items: [] } });

      expect(dialog().querySelector("h2")?.textContent).toBe("カート");
      expect(dialog().textContent).toContain("カートは空です");
      const shop = [...dialog().querySelectorAll("a")].find(
        (a) => a.textContent === "ショップを見る"
      )!;
      expect(shop.getAttribute("href")).toBe("/shop");
      expect(dialog().querySelector("[data-cart-footer]")).toBeNull();

      act(() => shop.click());
      expect(dialog().hasAttribute("inert")).toBe(true);
    });
  });
});
