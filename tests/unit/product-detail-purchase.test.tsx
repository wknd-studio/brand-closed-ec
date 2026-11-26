// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Cart, CartItem } from "@/lib/cart/types";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import {
  PAYMENT_METHOD,
  PAYMENT_TIMING,
  legalNoticePlainText,
} from "@/app/legal/legal-notice";
import AddToCartButton from "@/app/(member)/shop/[brand]/[id]/add-to-cart-button";
import ProductTerms from "@/app/(member)/shop/[brand]/[id]/product-terms";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ITEM: Omit<CartItem, "quantity"> = {
  productId: "p1",
  productName: "レザートートバッグ",
  thumbnail: null,
  unitPrice: 100_000,
  availability: "available",
  paymentTiming: "at_order",
};

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

function rowValue(label: string): HTMLElement | null {
  const dt = [...container.querySelectorAll("dt")].find(
    (el) => el.textContent === label
  );
  return (dt?.nextElementSibling as HTMLElement | null) ?? null;
}

describe("商品詳細の在庫・お支払いの表", () => {
  it("取り扱い中の商品は、在庫に「取り扱い中」を出す", () => {
    act(() =>
      root.render(
        <ProductTerms
          availability="available"
          paymentTiming="at_order"
          isNegotiable={false}
        />
      )
    );
    expect(rowValue("在庫")?.textContent).toBe("取り扱い中");
  });

  it("在庫切れの商品は、在庫に「在庫切れ」を出す", () => {
    act(() =>
      root.render(
        <ProductTerms
          availability="out_of_stock"
          paymentTiming="at_order"
          isNegotiable={false}
        />
      )
    );
    expect(rowValue("在庫")?.textContent).toBe("在庫切れ");
  });

  it("注文時払いの商品は、特商法の表記と同じ注文時払いの方法・時期を出す", () => {
    act(() =>
      root.render(
        <ProductTerms
          availability="available"
          paymentTiming="at_order"
          isNegotiable={false}
        />
      )
    );
    expect(rowValue("お支払い方法")?.textContent).toBe(
      legalNoticePlainText(PAYMENT_METHOD.atOrder)
    );
    expect(rowValue("お支払い時期")?.textContent).toBe(
      legalNoticePlainText(PAYMENT_TIMING.atOrder)
    );
  });

  it("請求書払いの商品は、特商法の表記と同じ請求書払いの方法・時期を出す", () => {
    act(() =>
      root.render(
        <ProductTerms
          availability="available"
          paymentTiming="after_order"
          isNegotiable={false}
        />
      )
    );
    expect(rowValue("お支払い方法")?.textContent).toBe(
      legalNoticePlainText(PAYMENT_METHOD.afterOrder)
    );
    expect(rowValue("お支払い時期")?.textContent).toBe(
      legalNoticePlainText(PAYMENT_TIMING.afterOrder)
    );
  });
});

describe("商品詳細の在庫・お支払いの表（要相談の商品）", () => {
  it("要相談の商品は、商品の設定が注文時払いでも、注文の保存と同じく請求書払いを出す", () => {
    act(() =>
      root.render(
        <ProductTerms
          availability="available"
          paymentTiming="at_order"
          isNegotiable
        />
      )
    );
    expect(rowValue("お支払い方法")?.textContent).toBe(
      legalNoticePlainText(PAYMENT_METHOD.afterOrder)
    );
  });
});

function CartOpenState() {
  const { isOpen } = useCart();
  return <p data-testid="cart-open">{isOpen ? "open" : "closed"}</p>;
}

function renderButton({
  item = ITEM,
  isOutOfStock = false,
  confirmedAmount = 0,
  monthlyLimit = 5_000_000,
  cart = { items: [] },
}: {
  item?: Omit<CartItem, "quantity">;
  isOutOfStock?: boolean;
  confirmedAmount?: number;
  monthlyLimit?: number | null;
  cart?: Cart;
} = {}) {
  act(() =>
    root.render(
      <CartProvider
        confirmedAmount={confirmedAmount}
        monthlyLimit={monthlyLimit}
        initialCart={cart}
      >
        <AddToCartButton item={item} isOutOfStock={isOutOfStock} />
        <CartOpenState />
      </CartProvider>
    )
  );
}

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (el) => (el.getAttribute("aria-label") ?? el.textContent?.trim()) === name
  );
  if (!found) throw new Error(`ボタン「${name}」が見つからない`);
  return found;
}

function click(el: HTMLElement) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("商品詳細のカートに追加", () => {
  it("数量の group に商品名の読み上げ名を付ける", () => {
    renderButton();
    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBe("レザートートバッグの数量");
  });

  it("追加できたら、role=status で「カートに追加しました」と「カートを見る」を出す", () => {
    renderButton();
    expect(container.querySelector('[role="status"]')).toBeNull();

    click(button("カートに追加"));

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("カートに追加しました");
    expect(container.querySelector('[role="alert"]')).toBeNull();

    click(button("カートを見る"));
    expect(
      container.querySelector('[data-testid="cart-open"]')?.textContent
    ).toBe("open");
  });

  it("月間の上限を超えたら、role=alert でエラー文言と今月の残りの金額を出す", () => {
    // 上限 500,000・確定 120,000 → 残り 380,000。100,000 × 4 = 400,000 は超える
    renderButton({ confirmedAmount: 120_000, monthlyLimit: 500_000 });
    click(button("数量を増やす"));
    click(button("数量を増やす"));
    click(button("数量を増やす"));

    click(button("カートに追加"));

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      "月間仕入れ上限（¥500,000）を超えるため追加できません"
    );
    expect(alert?.textContent).toContain("今月の残りは ¥380,000 です");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("上限を超えた後に追加できたら、エラーを消して追加の知らせに替える", () => {
    renderButton({ confirmedAmount: 120_000, monthlyLimit: 500_000 });
    click(button("数量を増やす"));
    click(button("数量を増やす"));
    click(button("数量を増やす"));
    click(button("カートに追加"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    click(button("数量を減らす"));
    click(button("カートに追加"));

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it("在庫切れのときは、ボタンを押せなくして理由を出す", () => {
    renderButton({
      item: { ...ITEM, availability: "out_of_stock" },
      isOutOfStock: true,
    });
    const add = button("在庫切れのため注文できません");
    expect(add.disabled).toBe(true);
    expect(button("数量を増やす").disabled).toBe(true);
  });
});
