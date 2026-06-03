import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { OrderConfirmingEmail } from "@/lib/email/templates/order-confirming";
import { OrderOperatorNotificationEmail } from "@/lib/email/templates/order-operator-notification";

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
