import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("@/infrastructure/resend/client", () => ({
  getResend: () => ({ emails: { send: sendMock } }),
}));

import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendCheckoutPaidEmail } from "@/infrastructure/resend/checkout-paid";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";
import { sendWelcomeEmail } from "@/infrastructure/resend/welcome";

const orderedAt = new Date("2026-11-24T01:00:00Z");

const WELCOME_PARAMS = {
  to: "member@example.com",
  rank: "standard" as const,
  monthlyLimit: 5_000_000,
  initialFee: 30_000,
  monthlyFee: 30_000,
  nextPaymentAt: new Date("2026-12-28T01:00:00Z"),
  withdrawableFrom: new Date("2027-05-27T15:00:00Z"),
};

function subjectSentTo(to: string): string {
  const call = sendMock.mock.calls.find(([arg]) => arg.to === to);
  return call?.[0].subject;
}

// 会員向けのメールの件名は「【EQ×Mart】◯◯（注文番号 ◯◯）」の形にそろえる（#851）
describe("会員向けメールの件名", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_TEST_TO", undefined);
    sendMock.mockResolvedValue({ data: { id: "id" }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("お支払いの完了", async () => {
    await sendCheckoutPaidEmail({
      orderId: "order-1",
      orderedAt,
      memberEmail: "member@example.com",
      lineItems: [],
      fixedTotal: 0,
    });
    expect(subjectSentTo("member@example.com")).toBe(
      "【EQ×Mart】お支払いが完了しました（注文番号 order-1）"
    );
  });

  it("ご注文の受付", async () => {
    await sendOrderConfirmingEmail({
      to: "member@example.com",
      orderId: "order-1",
      orderedAt,
      lineItems: [],
      fixedTotal: 0,
    });
    expect(subjectSentTo("member@example.com")).toBe(
      "【EQ×Mart】ご注文を受け付けました（注文番号 order-1）"
    );
  });

  it("発送", async () => {
    await sendShippingNotificationEmail({
      orderId: "order-1",
      memberEmail: "member@example.com",
    });
    expect(subjectSentTo("member@example.com")).toBe(
      "【EQ×Mart】商品を発送しました（注文番号 order-1）"
    );
  });

  it("お届け", async () => {
    await sendDeliveryNotificationEmail({
      orderId: "order-1",
      memberEmail: "member@example.com",
    });
    expect(subjectSentTo("member@example.com")).toBe(
      "【EQ×Mart】お届けが完了しました（注文番号 order-1）"
    );
  });

  it("上限超過による保留", async () => {
    await sendLimitExceededEmail({
      to: "member@example.com",
      orderId: "order-1",
    });
    expect(subjectSentTo("member@example.com")).toBe(
      "【EQ×Mart】ご注文を保留しています（注文番号 order-1）"
    );
  });

  // GitHub issue #852。注文ではないため注文番号は付けない
  it("ご入会", async () => {
    await sendWelcomeEmail(WELCOME_PARAMS);
    expect(subjectSentTo("member@example.com")).toBe(
      "【EQ×Mart】ご入会ありがとうございます"
    );
  });
});
