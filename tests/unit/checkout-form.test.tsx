// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/app/(member)/order/checkout/actions", () => ({
  placeOrder: vi.fn(),
}));

import CheckoutForm from "@/app/(member)/order/checkout/checkout-form";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const address = {
  id: "addr-1",
  isDefault: true,
  recipientLastName: "山田",
  recipientFirstName: "太郎",
  postalCode: "1000001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "1-1",
};

describe("CheckoutForm（注文の確定ボタン）", () => {
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

  function render(hasNotAccessible: boolean) {
    act(() =>
      root.render(
        <CheckoutForm
          shippingAddresses={[address]}
          billingAddresses={[address]}
          hasOutOfStock={false}
          hasNotAccessible={hasNotAccessible}
          fixedTotal={1000}
        />
      )
    );
  }

  function orderButton() {
    return [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "注文を確定する"
    )!;
  }

  it("権限外の商品があれば確定ボタンを押せず、カートから外すよう案内する", () => {
    render(true);

    expect(orderButton().disabled).toBe(true);
    expect(container.textContent).toContain(
      "現在のランクでは購入できない商品が含まれています。カートから削除してから注文してください。"
    );
  });

  it("権限外の商品が無ければ確定ボタンを押せる", () => {
    render(false);

    expect(orderButton().disabled).toBe(false);
    expect(container.textContent).not.toContain("現在のランクでは購入できない");
  });
});
