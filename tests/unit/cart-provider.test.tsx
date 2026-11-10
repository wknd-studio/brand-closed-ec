// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { readCart } from "@/lib/cart/cookie";
import type { Cart, CartItem } from "@/lib/cart/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type CartValue = ReturnType<typeof useCart>;

function Probe({ onRender }: { onRender: (value: CartValue) => void }) {
  onRender(useCart());
  return null;
}

const product: Omit<CartItem, "quantity"> = {
  productId: "product-1",
  productName: "商品1",
  thumbnail: null,
  unitPrice: 1000,
  availability: "available",
  paymentTiming: "at_order",
};

describe("CartProvider", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: CartValue;

  function render({
    initialCart = { items: [] },
    confirmedAmount = 0,
    monthlyLimit,
  }: {
    initialCart?: Cart;
    confirmedAmount?: number;
    monthlyLimit: number;
  }) {
    act(() => {
      root.render(
        <CartProvider
          initialCart={initialCart}
          confirmedAmount={confirmedAmount}
          monthlyLimit={monthlyLimit}
        >
          <Probe onRender={(value) => (latest = value)} />
        </CartProvider>
      );
    });
  }

  beforeEach(() => {
    document.cookie = "cart=; max-age=0; path=/";
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("上限を超えない追加はカートに入り、cookie にも書かれる", () => {
    render({ confirmedAmount: 3000, monthlyLimit: 5000 });

    let result: { error?: string } = {};
    act(() => {
      result = latest.addToCart(product, 2);
    });

    expect(result).toEqual({});
    expect(latest.cart.items).toEqual([{ ...product, quantity: 2 }]);
    expect(latest.totalUsed).toBe(5000);
    expect(readCart().items).toEqual([{ ...product, quantity: 2 }]);
  });

  it("上限を超える追加はエラーを返し、カートは変わらない", () => {
    const initialCart: Cart = { items: [{ ...product, quantity: 1 }] };
    render({ initialCart, confirmedAmount: 3000, monthlyLimit: 5000 });

    let result: { error?: string } = {};
    act(() => {
      result = latest.addToCart(product, 2);
    });

    expect(result.error).toBe(
      "月間仕入れ上限（¥5,000）を超えるため追加できません"
    );
    expect(latest.cart).toEqual(initialCart);
    expect(readCart().items).toEqual([]);
  });

  it("上限を超える数量変更はエラーを返し、カートは変わらない", () => {
    const initialCart: Cart = { items: [{ ...product, quantity: 1 }] };
    render({ initialCart, confirmedAmount: 3000, monthlyLimit: 5000 });

    let result: { error?: string } = {};
    act(() => {
      result = latest.updateItemQuantity("product-1", 3);
    });

    expect(result.error).toBe(
      "月間仕入れ上限（¥5,000）を超えるため変更できません"
    );
    expect(latest.cart).toEqual(initialCart);
    expect(readCart().items).toEqual([]);
  });

  it("上限を超えない数量変更はカートに反映される", () => {
    render({
      initialCart: { items: [{ ...product, quantity: 1 }] },
      confirmedAmount: 3000,
      monthlyLimit: 5000,
    });

    let result: { error?: string } = {};
    act(() => {
      result = latest.updateItemQuantity("product-1", 2);
    });

    expect(result).toEqual({});
    expect(latest.cart.items).toEqual([{ ...product, quantity: 2 }]);
  });

  it("Provider の外で useCart を使うとエラーになる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => act(() => root.render(<Probe onRender={() => {}} />))).toThrow(
      "useCart must be used within CartProvider"
    );
  });
});
