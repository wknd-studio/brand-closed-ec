// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/app/(member)/order/checkout/actions", () => ({
  placeOrder: vi.fn(),
}));
vi.mock("@/app/(member)/settings/actions", () => ({
  createAddressAction: vi.fn(),
  updateAddressAction: vi.fn(),
}));

import CheckoutForm from "@/app/(member)/order/checkout/checkout-form";
import { CartProvider } from "@/components/cart/cart-provider";

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

const otherAddress = {
  ...address,
  id: "addr-2",
  isDefault: false,
  recipientLastName: "物流",
  recipientFirstName: "センター",
};

type Props = ComponentProps<typeof CheckoutForm>;

const BASE_PROPS: Omit<Props, "openBillingPortal" | "children"> = {
  shippingAddresses: [address],
  billingAddresses: [address],
  hasOutOfStock: false,
  hasNotAccessible: false,
  summary: {
    hasAtOrder: true,
    hasAfterOrder: true,
    atOrderTotal: 78_000,
    afterOrderTotal: 71_500,
    negotiableCount: 1,
    fixedTotal: 149_500,
  },
  limitLines: [
    { productId: "p1", unitPrice: 78_000, quantity: 1 },
    { productId: "p2", unitPrice: 71_500, quantity: 1 },
    { productId: "p3", unitPrice: null, quantity: 2 },
  ],
  paymentFailed: false,
};

describe("CheckoutForm（ご注文内容の確認の住所・金額のまとめ・確定ボタン）", () => {
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

  const openBillingPortal = vi.fn(async () => ({ success: true as const }));

  function render(
    props: Partial<Props> = {},
    limit: { confirmedAmount: number; monthlyLimit: number | null } = {
      confirmedAmount: 1_240_000,
      monthlyLimit: 5_000_000,
    }
  ) {
    act(() =>
      root.render(
        <CartProvider
          confirmedAmount={limit.confirmedAmount}
          monthlyLimit={limit.monthlyLimit}
          initialCart={{ items: [] }}
        >
          <CheckoutForm
            {...BASE_PROPS}
            openBillingPortal={openBillingPortal}
            {...props}
          >
            <section>ご注文の商品</section>
          </CheckoutForm>
        </CartProvider>
      )
    );
  }

  function orderButton() {
    return [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "注文を確定する"
    );
  }

  function summary() {
    return container.querySelector('aside[aria-label="お支払い金額"]')!;
  }

  function summaryRow(label: string) {
    const dt = [...summary().querySelectorAll("dt")].find(
      (el) => el.textContent === label
    );
    return dt?.nextElementSibling?.textContent;
  }

  describe("金額のまとめ", () => {
    it("クレジットカード（注文時）・請求書（注文後に請求）の額・価格要相談の件数・合計を出す", () => {
      render();

      expect(summaryRow("クレジットカード（注文時）")).toBe("¥78,000");
      expect(summaryRow("請求書（注文後に請求）")).toBe("¥71,500");
      expect(summaryRow("価格要相談")).toBe("1点（後日ご連絡）");
      expect(summaryRow("合計")).toBe("¥149,500");
    });

    it("カードの商品が無ければカードの行を、請求書の商品が無ければ請求書の行を、要相談が無ければ要相談の行を出さない", () => {
      render({
        summary: {
          hasAtOrder: true,
          hasAfterOrder: false,
          atOrderTotal: 78_000,
          afterOrderTotal: 0,
          negotiableCount: 0,
          fixedTotal: 78_000,
        },
      });

      expect(summaryRow("クレジットカード（注文時）")).toBe("¥78,000");
      expect(summaryRow("請求書（注文後に請求）")).toBeUndefined();
      expect(summaryRow("価格要相談")).toBeUndefined();

      render({
        summary: {
          hasAtOrder: false,
          hasAfterOrder: true,
          atOrderTotal: 0,
          afterOrderTotal: 71_500,
          negotiableCount: 0,
          fixedTotal: 71_500,
        },
      });

      expect(summaryRow("クレジットカード（注文時）")).toBeUndefined();
      expect(summaryRow("請求書（注文後に請求）")).toBe("¥71,500");
    });

    it("注文後の今月の仕入れ枠の残り（上限 - 今月の確定額 - この注文の固定価格の額）を出す", () => {
      render();

      // 5,000,000 - 1,240,000 - 149,500
      expect(summary().textContent).toContain("注文を確定したあと");
      expect(summary().textContent).toContain("残り ¥3,610,500");
    });

    it("上限が無制限なら、注文後の残りは「上限なし」と出す", () => {
      render({}, { confirmedAmount: 0, monthlyLimit: null });

      expect(summary().textContent).toContain("上限なし");
    });

    it("カードの商品があれば、カードの分を Stripe の決済画面で払う旨を額とともに出す", () => {
      render();

      expect(summary().textContent).toContain(
        "確定すると、クレジットカードの商品（¥78,000）は Stripe の決済画面でお支払いいただきます。"
      );
    });

    it("請求書の商品だけなら、Stripe の決済画面の案内の代わりに請求書を送る旨を出す", () => {
      render({
        summary: {
          hasAtOrder: false,
          hasAfterOrder: true,
          atOrderTotal: 0,
          afterOrderTotal: 71_500,
          negotiableCount: 0,
          fixedTotal: 71_500,
        },
      });

      expect(summary().textContent).not.toContain("Stripe の決済画面");
      expect(summary().textContent).toContain(
        "確定すると、運営者が内容を確認したあと、請求書をお送りします。"
      );
    });
  });

  describe("注文できないとき", () => {
    it("注文できる状態なら確定ボタンを押せ、理由を出さない", () => {
      render();

      expect(orderButton()!.disabled).toBe(false);
      expect(summary().textContent).not.toContain("すると、注文できます");
    });

    it("在庫切れの商品があれば確定ボタンを押せず、理由と在庫切れの案内を出す", () => {
      render({ hasOutOfStock: true });

      expect(orderButton()!.disabled).toBe(true);
      expect(summary().textContent).toContain(
        "在庫切れの商品をカートから削除すると、注文できます。"
      );
      expect(container.textContent).toContain(
        "在庫切れの商品が含まれています。カートから削除してから注文してください。"
      );
    });

    it("権限外の商品があれば確定ボタンを押せず、理由とカートから外す案内を出す", () => {
      render({ hasNotAccessible: true });

      expect(orderButton()!.disabled).toBe(true);
      expect(summary().textContent).toContain(
        "現在のランクでは購入できない商品をカートから削除すると、注文できます。"
      );
      expect(container.textContent).toContain(
        "現在のランクでは購入できない商品が含まれています。カートから削除してから注文してください。"
      );
    });

    it("住所が未登録（未選択）なら確定ボタンを押せず、理由を出す", () => {
      render({ shippingAddresses: [], billingAddresses: [] });

      expect(orderButton()!.disabled).toBe(true);
      expect(summary().textContent).toContain(
        "お届け先・請求先の住所を選ぶと、注文できます。"
      );
    });
  });

  describe("お届け先・請求先", () => {
    it("住所を選べるカードを出し、いつもの住所に印を付けて最初から選んでおく", () => {
      render({
        shippingAddresses: [otherAddress, address],
        billingAddresses: [address],
      });

      const radios = [
        ...container.querySelectorAll<HTMLInputElement>(
          'input[name="shipping_address"]'
        ),
      ];
      expect(radios.map((r) => r.value)).toEqual(["addr-2", "addr-1"]);
      expect(radios.find((r) => r.checked)?.value).toBe("addr-1");
      const defaultCard = radios[1].closest("label")!;
      expect(defaultCard.textContent).toContain("いつもの住所");
      expect(radios[0].closest("label")!.textContent).not.toContain(
        "いつもの住所"
      );
    });

    it("「請求先はお届け先と同じ」を選ぶと請求先の選択を隠す", () => {
      render();

      const same = [
        ...container.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]'
        ),
      ].find((c) =>
        c.closest("label")?.textContent?.includes("請求先はお届け先と同じ")
      )!;
      expect(
        container.querySelectorAll('input[name="billing_address"]')
      ).toHaveLength(1);

      act(() => same.click());

      expect(
        container.querySelectorAll('input[name="billing_address"]')
      ).toHaveLength(0);
    });

    it("住所が未登録なら、その場で住所を入力できる", () => {
      render({ shippingAddresses: [], billingAddresses: [] });

      const add = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "＋ 新規登録"
      )!;
      act(() => add.click());

      expect(
        container.querySelector('input[name="recipient_last_name"]')
      ).not.toBeNull();
    });
  });

  describe("月額費用の支払い失敗中", () => {
    it("確定ボタンの代わりにお支払い方法の更新を案内する", async () => {
      render({ paymentFailed: true });

      expect(orderButton()).toBeUndefined();
      expect(container.textContent).toContain("お支払い方法の更新が必要です");
      const updateButton = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "お支払い方法を変更する"
      )!;
      await act(async () => updateButton.click());
      expect(openBillingPortal).toHaveBeenCalled();
    });

    it("支払い失敗中でなければ、お支払い方法の更新の案内を出さない", () => {
      render();

      expect(orderButton()).toBeDefined();
      expect(container.textContent).not.toContain(
        "お支払い方法の更新が必要です"
      );
    });
  });
});
