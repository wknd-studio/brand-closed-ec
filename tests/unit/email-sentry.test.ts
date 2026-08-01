import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@react-email/components", () => ({
  render: vi.fn().mockResolvedValue("<html></html>"),
}));

vi.mock("@/lib/email/templates/order-confirming", () => ({
  OrderConfirmingEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/checkout-paid-member", () => ({
  CheckoutPaidMemberEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/checkout-paid-operator", () => ({
  CheckoutPaidOperatorEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/delivery-notification", () => ({
  DeliveryNotificationEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/invoice-paid-operator", () => ({
  InvoicePaidOperatorEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/shipping-notification", () => ({
  ShippingNotificationEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/order-operator-notification", () => ({
  OrderOperatorNotificationEmail: vi.fn(),
}));
vi.mock("@/lib/email/templates/limit-exceeded-member", () => ({
  LimitExceededMemberEmail: vi.fn(),
}));

const sendMock = vi.fn();
vi.mock("@/lib/email/index", () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}));

import * as Sentry from "@sentry/nextjs";
import { sendOrderConfirmingEmail } from "@/lib/email/order-confirming";
import { sendCheckoutPaidEmails } from "@/lib/email/checkout-paid";
import { sendDeliveryNotificationEmail } from "@/lib/email/delivery-notification";
import { sendInvoicePaidEmail } from "@/lib/email/invoice-paid";
import { sendShippingNotificationEmail } from "@/lib/email/shipping-notification";
import { sendOrderOperatorNotification } from "@/lib/email/order-operator-notification";
import { sendLimitExceededEmail } from "@/lib/email/limit-exceeded";

const resendError = { name: "application_error", message: "送信失敗" };

describe("メール送信失敗時のSentry送信", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: null, error: resendError });
  });

  it("sendOrderConfirmingEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendOrderConfirmingEmail({
      to: "test@example.com",
      orderId: "order-1",
      lineItems: [],
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "order-confirming" }),
      })
    );
  });

  it("sendCheckoutPaidEmails失敗時に会員・運営者それぞれでSentry.captureExceptionを呼ぶ", async () => {
    await sendCheckoutPaidEmails({
      orderId: "order-1",
      memberEmail: "member@example.com",
      lineItems: [],
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "checkout-paid-member" }),
      })
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "checkout-paid-operator" }),
      })
    );
  });

  it("sendDeliveryNotificationEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendDeliveryNotificationEmail({
      orderId: "order-1",
      memberEmail: "member@example.com",
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "delivery-notification" }),
      })
    );
  });

  it("sendInvoicePaidEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendInvoicePaidEmail({
      orderId: "order-1",
      memberEmail: "member@example.com",
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "invoice-paid" }),
      })
    );
  });

  it("sendShippingNotificationEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendShippingNotificationEmail({
      orderId: "order-1",
      memberEmail: "member@example.com",
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "shipping-notification" }),
      })
    );
  });

  it("sendOrderOperatorNotification失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendOrderOperatorNotification({
      orderId: "order-1",
      customerEmail: "member@example.com",
      lineItems: [],
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "order-operator-notification" }),
      })
    );
  });

  it("sendLimitExceededEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendLimitExceededEmail({
      to: "member@example.com",
      orderId: "order-1",
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "limit-exceeded" }),
      })
    );
  });
});
