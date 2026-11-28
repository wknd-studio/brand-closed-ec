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
vi.mock("@/emails/delivery-notification", () => ({
  DeliveryNotificationEmail: vi.fn(),
}));
vi.mock("@/emails/shipping-notification", () => ({
  ShippingNotificationEmail: vi.fn(),
}));
vi.mock("@/emails/limit-exceeded-member", () => ({
  LimitExceededMemberEmail: vi.fn(),
}));
vi.mock("@/emails/welcome", () => ({
  WelcomeEmail: vi.fn(),
}));

const sendMock = vi.fn();
vi.mock("@/infrastructure/resend/client", () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}));

import * as Sentry from "@sentry/nextjs";
import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendCheckoutPaidEmail } from "@/infrastructure/resend/checkout-paid";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";
import { sendWelcomeEmail } from "@/infrastructure/resend/welcome";

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
      orderedAt: new Date(),
      lineItems: [],
      fixedTotal: 0,
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "order-confirming" }),
      })
    );
  });

  it("sendCheckoutPaidEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendCheckoutPaidEmail({
      orderId: "order-1",
      orderedAt: new Date(),
      memberEmail: "member@example.com",
      lineItems: [],
      fixedTotal: 0,
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "checkout-paid-member" }),
      })
    );
  });

  it("sendCheckoutPaidEmailは会員宛ての1通だけを送る（運営者への通知はSlack。#830）", async () => {
    sendMock.mockResolvedValue({ data: null, error: null });

    await sendCheckoutPaidEmail({
      orderId: "order-1",
      orderedAt: new Date(),
      memberEmail: "member@example.com",
      lineItems: [],
      fixedTotal: 0,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].subject).toContain(
      "お支払いが完了しました"
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

  // GitHub issue #852
  it("sendWelcomeEmail失敗時にSentry.captureExceptionを呼ぶ", async () => {
    await sendWelcomeEmail({
      to: "member@example.com",
      rank: "standard",
      monthlyLimit: 5_000_000,
      initialFee: 30_000,
      monthlyFee: 30_000,
      nextPaymentAt: new Date(),
      withdrawableFrom: new Date(),
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      resendError,
      expect.objectContaining({
        tags: expect.objectContaining({ email: "welcome" }),
      })
    );
  });
});
