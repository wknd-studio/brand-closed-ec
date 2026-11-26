// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProductCard } from "@/components/ui/product-card";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PRODUCT: ComponentProps<typeof ProductCard> = {
  href: "/shop/Brand%20A/prod-1",
  name: "レザートートバッグ",
  imageUrl: "https://cdn.example/a.jpg",
  retailPrice: 48000,
  unitPrice: 31200,
  isNegotiable: false,
};

describe("ProductCard", () => {
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

  function render(props: Partial<ComponentProps<typeof ProductCard>> = {}) {
    act(() => root.render(<ProductCard {...PRODUCT} {...props} />));
    return container;
  }

  it("商品の詳細へのリンクの中に、画像（代替テキストは商品名）・商品名・会員価格・参考小売価格を置く", () => {
    render();

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/shop/Brand%20A/prod-1");
    expect(link?.querySelector("img")?.getAttribute("alt")).toBe(
      "レザートートバッグ"
    );
    expect(link?.textContent).toContain("レザートートバッグ");
    expect(link?.textContent).toContain("¥31,200");
    expect(link?.textContent).toContain("参考小売価格 ¥48,000");
    expect(link?.textContent).not.toContain("価格要相談");
  });

  it("画像の無い商品は、画像の代わりの枠を出す", () => {
    render({ imageUrl: null });

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-product-image]")).not.toBeNull();
  });

  it("価格要相談の商品は、会員価格の代わりに「価格要相談」を出し、参考小売価格は出す", () => {
    render({ isNegotiable: true, unitPrice: null });

    expect(container.textContent).toContain("価格要相談");
    expect(container.textContent).toContain("参考小売価格 ¥48,000");
    expect(container.textContent?.match(/¥/g)).toHaveLength(1);
  });

  it("会員価格が未設定の商品は、会員価格を出さない", () => {
    render({ unitPrice: null });

    expect(container.textContent).not.toContain("価格要相談");
    expect(container.textContent?.match(/¥/g)).toHaveLength(1);
  });

  it("在庫切れは画像に重ねず、商品名の上に danger の色の小さな文字で出し、画像を薄くする", () => {
    render({ isOutOfStock: true });

    const tag = [...container.querySelectorAll("span")].find(
      (el) => el.textContent === "在庫切れ"
    );
    expect(tag?.className).toContain("text-danger");
    expect(tag?.closest("[data-product-image]")).toBeNull();
    expect(container.textContent?.indexOf("在庫切れ")).toBeLessThan(
      container.textContent!.indexOf("レザートートバッグ")
    );
    expect(
      container.querySelector("[data-product-image] [data-out-of-stock-veil]")
    ).not.toBeNull();
  });

  it("在庫のある商品は、在庫切れの文字も画像を薄くする覆いも出さない", () => {
    render();

    expect(container.textContent).not.toContain("在庫切れ");
    expect(container.querySelector("[data-out-of-stock-veil]")).toBeNull();
  });

  it("請求書払いの商品は、商品名の上に info の色の小さな文字で「請求書払い」を出す", () => {
    render({ isInvoicePayment: true });

    const tag = [...container.querySelectorAll("span")].find(
      (el) => el.textContent === "請求書払い"
    );
    expect(tag?.className).toContain("text-info");
    expect(tag?.closest("[data-product-image]")).toBeNull();
    expect(container.textContent?.indexOf("請求書払い")).toBeLessThan(
      container.textContent!.indexOf("レザートートバッグ")
    );
  });

  it("お気に入りのボタンは、リンクの外の画像の右上に置く（ボタンをリンクの中に入れない）", () => {
    render({ favorite: <button type="button">お気に入りに追加</button> });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.closest("a")).toBeNull();
    expect(button?.parentElement?.className).toContain("absolute");
    expect(button?.parentElement?.className).toContain("right-");
    expect(button?.parentElement?.className).toContain("top-");
  });
  it("ブランド名を渡すと、商品名の上に出す", () => {
    render({ brand: "Brand A" });

    expect(container.textContent).toContain("Brand A");
    expect(container.textContent?.indexOf("Brand A")).toBeLessThan(
      container.textContent!.indexOf("レザートートバッグ")
    );
  });

  it("今のプランで見られない商品は、画像の上に鍵のアイコン（SVG）と「今のプランではご覧いただけません」を出し、価格を出さず、リンクにしない", () => {
    render({
      isLocked: true,
      favorite: <button type="button">お気に入りから削除</button>,
    });

    expect(container.querySelector("a")).toBeNull();
    const veil = container.querySelector(
      "[data-product-image] [data-locked-veil]"
    );
    expect(veil?.querySelector("svg")).not.toBeNull();
    expect(veil?.textContent).toBe("今のプランではご覧いただけません");
    expect(container.textContent).not.toContain("🔒");
    expect(container.textContent).not.toContain("¥");
    expect(container.textContent).not.toContain("価格要相談");
    expect(container.textContent).toContain("レザートートバッグ");
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("見られる商品は、鍵の覆いを出さない", () => {
    render();

    expect(container.querySelector("[data-locked-veil]")).toBeNull();
  });
});
