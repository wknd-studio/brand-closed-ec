import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeOrder } from "./use-cases/helpers";

const createCheckoutSessionMock = vi.fn();
const createInvoiceMock = vi.fn();
const createInvoiceItemMock = vi.fn();
const finalizeInvoiceMock = vi.fn();
const sendInvoiceMock = vi.fn();

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createCheckoutSessionMock } },
    invoices: {
      create: createInvoiceMock,
      finalizeInvoice: finalizeInvoiceMock,
      sendInvoice: sendInvoiceMock,
    },
    invoiceItems: { create: createInvoiceItemMock },
  }),
}));

import { StripePaymentGateway } from "@/infrastructure/stripe/stripe-payment-gateway";

// 商品代金の支払い手段はカード（Link で保存したカードを含む）だけ。
// ダッシュボードの支払い手段の設定によらないよう、コードで指定する（#809）
describe("StripePaymentGateway - 支払い手段", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCheckoutSessionMock.mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.stripe.com/cs_1",
    });
    createInvoiceMock.mockResolvedValue({ id: "in_1" });
    createInvoiceItemMock.mockResolvedValue({ id: "ii_1" });
    finalizeInvoiceMock.mockResolvedValue({ id: "in_1" });
    sendInvoiceMock.mockResolvedValue({ id: "in_1" });
  });

  it("createCheckoutSessionは、支払い手段をカードとLinkだけに指定する", async () => {
    const gateway = new StripePaymentGateway();

    await gateway.createCheckoutSession(
      makeOrder(),
      [{ productName: "商品A", unitPrice: 1000, quantity: 1 }],
      "http://localhost:3000"
    );

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method_types: ["card", "link"] }),
      expect.any(Object)
    );
  });

  // 換算した外貨で払わせない。ダッシュボードの設定（既定で有効）によらないよう、
  // コードで指定する（#810）
  it("createCheckoutSessionは、Adaptive Pricingを無効にし、円で払わせる", async () => {
    const gateway = new StripePaymentGateway();

    await gateway.createCheckoutSession(
      makeOrder(),
      [{ productName: "商品A", unitPrice: 1000, quantity: 1 }],
      "http://localhost:3000"
    );

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ adaptive_pricing: { enabled: false } }),
      {
        idempotencyKey: "checkout-session-00000000-0000-0000-0000-000000000001",
      }
    );
  });

  it("createInvoiceForOrderは、請求書の支払い手段をカードとLinkだけに指定する", async () => {
    const gateway = new StripePaymentGateway();

    await gateway.createInvoiceForOrder(makeOrder(), "cus_1");

    expect(createInvoiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection_method: "send_invoice",
        payment_settings: { payment_method_types: ["card", "link"] },
      }),
      expect.any(Object)
    );
  });
});
