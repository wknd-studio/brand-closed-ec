import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { CheckoutPaidMemberEmail } from "@/emails/checkout-paid-member";
import { LimitExceededMemberEmail } from "@/emails/limit-exceeded-member";
import { OrderConfirmingEmail } from "@/emails/order-confirming";
import { ShippingNotificationEmail } from "@/emails/shipping-notification";
import { DeliveryNotificationEmail } from "@/emails/delivery-notification";

const fixedItem = {
  productName: "テスト商品A",
  quantity: 2,
  unitPrice: 5000,
  isNegotiable: false,
};

const negotiableItem = {
  productName: "テスト商品B",
  quantity: 1,
  unitPrice: null,
  isNegotiable: true,
};

describe("OrderConfirmingEmail", () => {
  it("注文IDと商品名が含まれる", async () => {
    const html = await render(
      <OrderConfirmingEmail orderId="ORDER-001" lineItems={[fixedItem]} />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("テスト商品A");
  });

  it("固定価格商品の価格が表示される", async () => {
    const html = await render(
      <OrderConfirmingEmail orderId="ORDER-001" lineItems={[fixedItem]} />
    );
    expect(html).toContain("5,000");
  });

  it("要相談商品は「要相談」と表示される", async () => {
    const html = await render(
      <OrderConfirmingEmail orderId="ORDER-001" lineItems={[negotiableItem]} />
    );
    expect(html).toContain("要相談");
    expect(html).not.toContain("null");
  });
});

describe("CheckoutPaidMemberEmail", () => {
  it("注文IDと商品名とマイページリンクが含まれる", async () => {
    const html = await render(
      <CheckoutPaidMemberEmail
        orderId="ORDER-001"
        lineItems={[fixedItem]}
        myPageUrl="https://example.com/orders/ORDER-001"
      />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("テスト商品A");
    expect(html).toContain("https://example.com/orders/ORDER-001");
  });

  it("固定価格商品の価格が表示される", async () => {
    const html = await render(
      <CheckoutPaidMemberEmail
        orderId="ORDER-001"
        lineItems={[fixedItem]}
        myPageUrl="https://example.com/orders/ORDER-001"
      />
    );
    expect(html).toContain("5,000");
  });
});

describe("LimitExceededMemberEmail", () => {
  it("注文IDと上限超過のメッセージが含まれる", async () => {
    const html = await render(<LimitExceededMemberEmail orderId="ORDER-001" />);
    expect(html).toContain("ORDER-001");
    expect(html).toContain("上限");
  });
});

describe("ShippingNotificationEmail", () => {
  it("注文IDとマイページリンクが含まれる", async () => {
    const html = await render(
      <ShippingNotificationEmail
        orderId="ORDER-001"
        myPageUrl="https://example.com/orders/ORDER-001"
      />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("https://example.com/orders/ORDER-001");
  });

  it("発送に関するメッセージが含まれる", async () => {
    const html = await render(
      <ShippingNotificationEmail
        orderId="ORDER-001"
        myPageUrl="https://example.com/orders/ORDER-001"
      />
    );
    expect(html).toContain("発送");
  });
});

describe("DeliveryNotificationEmail", () => {
  it("注文IDとマイページリンクが含まれる", async () => {
    const html = await render(
      <DeliveryNotificationEmail
        orderId="ORDER-001"
        myPageUrl="https://example.com/orders/ORDER-001"
      />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("https://example.com/orders/ORDER-001");
  });

  it("配送完了に関するメッセージが含まれる", async () => {
    const html = await render(
      <DeliveryNotificationEmail
        orderId="ORDER-001"
        myPageUrl="https://example.com/orders/ORDER-001"
      />
    );
    expect(html).toContain("配送完了");
  });
});
