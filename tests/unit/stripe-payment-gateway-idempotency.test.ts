import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderItem } from "@/domain/entities/order-item";
import { Money } from "@/domain/value-objects/money";
import { makeOrder } from "./use-cases/helpers";

const createCheckoutSessionMock = vi.fn();
const createCustomerMock = vi.fn();
const createInvoiceMock = vi.fn();
const createInvoiceItemMock = vi.fn();
const finalizeInvoiceMock = vi.fn();
const sendInvoiceMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createCheckoutSessionMock } },
    customers: { create: createCustomerMock },
    invoices: {
      create: createInvoiceMock,
      finalizeInvoice: finalizeInvoiceMock,
      sendInvoice: sendInvoiceMock,
    },
    invoiceItems: { create: createInvoiceItemMock },
  }),
}));

import { StripePaymentGateway } from "@/infrastructure/stripe/stripe-payment-gateway";

// makeOrder（tests/unit/use-cases/helpers.ts）は固定ID
// "00000000-0000-0000-0000-000000000001" を使う
const ORDER_ID = "00000000-0000-0000-0000-000000000001";

describe("StripePaymentGateway - 冪等性キー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCheckoutSessionMock.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/cs_1",
    });
    createCustomerMock.mockResolvedValue({ id: "cus_1" });
    createInvoiceMock.mockResolvedValue({ id: "in_1" });
    createInvoiceItemMock.mockResolvedValue({ id: "ii_1" });
    finalizeInvoiceMock.mockResolvedValue({ id: "in_1" });
    sendInvoiceMock.mockResolvedValue({ id: "in_1" });
  });

  it("createCheckoutSessionは注文IDベースのidempotencyKeyを付与する", async () => {
    const gateway = new StripePaymentGateway();
    const order = makeOrder();

    await gateway.createCheckoutSession(
      order,
      [{ productName: "商品A", unitPrice: 1000, quantity: 1 }],
      "http://localhost:3000"
    );

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: `checkout-session-${ORDER_ID}`,
    });
  });

  it("ensureCustomerはuserIdベースのidempotencyKeyを付与する", async () => {
    const gateway = new StripePaymentGateway();

    await gateway.ensureCustomer("test@example.com", "user-1");

    expect(createCustomerMock).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: "ensure-customer-user-1",
    });
  });

  it("createInvoiceForOrderは、invoice作成と各商品のinvoiceItem作成それぞれに別々のidempotencyKeyを付与する", async () => {
    const gateway = new StripePaymentGateway();
    const order = makeOrder({
      items: [
        OrderItem.of({
          id: "item-1",
          sanityProductId: "prod-1",
          productNameSnapshot: "商品A",
          unitPriceSnapshot: Money.of(1000),
          quantity: 1,
          isNegotiable: false,
          negotiatedUnitPrice: null,
        }),
        OrderItem.of({
          id: "item-2",
          sanityProductId: "prod-2",
          productNameSnapshot: "商品B",
          unitPriceSnapshot: Money.of(2000),
          quantity: 2,
          isNegotiable: false,
          negotiatedUnitPrice: null,
        }),
      ],
    });

    await gateway.createInvoiceForOrder(order, "cus_1");

    expect(createInvoiceMock).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: `invoice-${ORDER_ID}`,
    });

    expect(createInvoiceItemMock).toHaveBeenCalledTimes(2);
    expect(createInvoiceItemMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      { idempotencyKey: `invoice-item-${ORDER_ID}-item-1` }
    );
    expect(createInvoiceItemMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      { idempotencyKey: `invoice-item-${ORDER_ID}-item-2` }
    );

    // invoiceItemごとに異なるキーであることを明示的に確認
    // （同一キーだとStripeが2件目以降を最初のレスポンスのキャッシュとして
    //  返してしまい、2番目以降の商品が請求書に反映されなくなる）
    const keys = createInvoiceItemMock.mock.calls.map(
      (call) => call[1].idempotencyKey
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
