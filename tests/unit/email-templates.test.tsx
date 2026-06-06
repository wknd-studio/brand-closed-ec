import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { CheckoutPaidMemberEmail } from "@/lib/email/templates/checkout-paid-member";
import { CheckoutPaidOperatorEmail } from "@/lib/email/templates/checkout-paid-operator";
import { InvoicePaidOperatorEmail } from "@/lib/email/templates/invoice-paid-operator";
import { LimitExceededMemberEmail } from "@/lib/email/templates/limit-exceeded-member";
import { OrderConfirmingEmail } from "@/lib/email/templates/order-confirming";
import { OrderOperatorNotificationEmail } from "@/lib/email/templates/order-operator-notification";
import { ShippingNotificationEmail } from "@/lib/email/templates/shipping-notification";
import { DeliveryNotificationEmail } from "@/lib/email/templates/delivery-notification";

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

describe("OrderOperatorNotificationEmail", () => {
  it("注文IDと注文者メールと商品名が含まれる", async () => {
    const html = await render(
      <OrderOperatorNotificationEmail
        orderId="ORDER-001"
        customerEmail="member@example.com"
        lineItems={[fixedItem]}
        adminOrderUrl="https://example.com/admin/orders/ORDER-001"
      />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("member@example.com");
    expect(html).toContain("テスト商品A");
  });

  it("管理画面リンクが含まれる", async () => {
    const html = await render(
      <OrderOperatorNotificationEmail
        orderId="ORDER-001"
        customerEmail="member@example.com"
        lineItems={[fixedItem]}
        adminOrderUrl="https://example.com/admin/orders/ORDER-001"
      />
    );
    expect(html).toContain("https://example.com/admin/orders/ORDER-001");
  });

  it("要相談商品は「要相談」と表示される", async () => {
    const html = await render(
      <OrderOperatorNotificationEmail
        orderId="ORDER-001"
        customerEmail="member@example.com"
        lineItems={[negotiableItem]}
        adminOrderUrl="https://example.com/admin/orders/ORDER-001"
      />
    );
    expect(html).toContain("要相談");
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

describe("CheckoutPaidOperatorEmail", () => {
  it("注文IDと注文者メールと管理画面リンクが含まれる", async () => {
    const html = await render(
      <CheckoutPaidOperatorEmail
        orderId="ORDER-001"
        customerEmail="member@example.com"
        lineItems={[fixedItem]}
        adminOrderUrl="https://example.com/admin/orders/ORDER-001"
      />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("member@example.com");
    expect(html).toContain("https://example.com/admin/orders/ORDER-001");
  });
});

describe("InvoicePaidOperatorEmail", () => {
  it("注文IDと注文者メールと管理画面リンクが含まれる", async () => {
    const html = await render(
      <InvoicePaidOperatorEmail
        orderId="ORDER-001"
        customerEmail="member@example.com"
        adminOrderUrl="https://example.com/admin/orders/ORDER-001"
      />
    );
    expect(html).toContain("ORDER-001");
    expect(html).toContain("member@example.com");
    expect(html).toContain("https://example.com/admin/orders/ORDER-001");
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
