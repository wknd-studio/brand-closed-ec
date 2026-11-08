import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@react-email/components", () => ({
  render: vi.fn().mockResolvedValue("<html></html>"),
}));

vi.mock("@/emails/order-confirming", () => ({
  OrderConfirmingEmail: vi.fn(),
}));
vi.mock("@/emails/checkout-paid-member", () => ({
  CheckoutPaidMemberEmail: vi.fn(),
}));
vi.mock("@/emails/checkout-paid-operator", () => ({
  CheckoutPaidOperatorEmail: vi.fn(),
}));
vi.mock("@/emails/delivery-notification", () => ({
  DeliveryNotificationEmail: vi.fn(),
}));
vi.mock("@/emails/invoice-paid-operator", () => ({
  InvoicePaidOperatorEmail: vi.fn(),
}));
vi.mock("@/emails/shipping-notification", () => ({
  ShippingNotificationEmail: vi.fn(),
}));
vi.mock("@/emails/order-operator-notification", () => ({
  OrderOperatorNotificationEmail: vi.fn(),
}));
vi.mock("@/emails/limit-exceeded-member", () => ({
  LimitExceededMemberEmail: vi.fn(),
}));

const sendMock = vi.fn();
vi.mock("@/infrastructure/resend/client", () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}));

import * as Sentry from "@sentry/nextjs";
import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendCheckoutPaidEmails } from "@/infrastructure/resend/checkout-paid";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendInvoicePaidEmail } from "@/infrastructure/resend/invoice-paid";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendOrderOperatorNotification } from "@/infrastructure/resend/order-operator-notification";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";

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
