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
import { OrderNumber } from "@/domain/value-objects/order-number";

const APP_URL = "https://shop.example.com";
const orderedAt = new Date("2026-11-24T01:00:00Z");
const orderId = "3f1c2b8e-6d4a-4f0e-9b7c-2a5d8e1f0c3b";
const orderNumber = OrderNumber.of("K7Q2M9XD");

const WELCOME_PARAMS = {
  to: "member@example.com",
  rank: "standard" as const,
  monthlyLimit: 5_000_000,
  initialFee: 30_000,
  monthlyFee: 30_000,
  nextPaymentAt: new Date("2026-12-28T01:00:00Z"),
  withdrawableFrom: new Date("2027-05-27T15:00:00Z"),
};

function sentTo(to: string): { subject: string; html: string } {
  const call = sendMock.mock.calls.find(([arg]) => arg.to === to);
  return call?.[0];
}

// 会員向けのメールの件名は「【EQ×Mart】◯◯（注文番号 ◯◯）」の形にそろえる（#851）。
// 注文番号は画面と同じ OrderNumber の表示の形で出し、注文ID（UUID）はリンクにだけ使う（#756）
const memberEmails = [
  {
    name: "お支払いの完了",
    subject: "【EQ×Mart】お支払いが完了しました（注文番号 K7Q2-M9XD）",
    send: () =>
      sendCheckoutPaidEmail({
        orderId,
        orderNumber,
        orderedAt,
        memberEmail: "member@example.com",
        lineItems: [],
        fixedTotal: 0,
      }),
  },
  {
    name: "ご注文の受付",
    subject: "【EQ×Mart】ご注文を受け付けました（注文番号 K7Q2-M9XD）",
    send: () =>
      sendOrderConfirmingEmail({
        to: "member@example.com",
        orderId,
        orderNumber,
        orderedAt,
        lineItems: [],
        fixedTotal: 0,
      }),
  },
  {
    name: "発送",
    subject: "【EQ×Mart】商品を発送しました（注文番号 K7Q2-M9XD）",
    send: () =>
      sendShippingNotificationEmail({
        orderId,
        orderNumber,
        memberEmail: "member@example.com",
      }),
  },
  {
    name: "お届け",
    subject: "【EQ×Mart】お届けが完了しました（注文番号 K7Q2-M9XD）",
    send: () =>
      sendDeliveryNotificationEmail({
        orderId,
        orderNumber,
        memberEmail: "member@example.com",
      }),
  },
  {
    name: "上限超過による保留",
    subject: "【EQ×Mart】ご注文を保留しています（注文番号 K7Q2-M9XD）",
    send: () =>
      sendLimitExceededEmail({
        to: "member@example.com",
        orderId,
        orderNumber,
      }),
  },
];

describe.each(memberEmails)("会員向けメール: $name", ({ subject, send }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_TEST_TO", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    sendMock.mockResolvedValue({ data: { id: "id" }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("件名の注文番号は表示の形（4文字ずつハイフン区切り）", async () => {
    await send();
    expect(sentTo("member@example.com").subject).toBe(subject);
  });

  it("本文の注文番号の枠に表示の形の注文番号を出す", async () => {
    await send();
    expect(sentTo("member@example.com").html).toContain("K7Q2-M9XD");
  });

  it("注文詳細へのリンクは注文ID（UUID）で開き、注文IDはリンクの外に出さない", async () => {
    await send();
    const { html } = sentTo("member@example.com");
    expect(html).toContain(`href="${APP_URL}/orders/${orderId}"`);
    expect(html.split(orderId).length - 1).toBe(1);
  });
});

describe("会員向けメール: ご入会", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_TEST_TO", undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
    sendMock.mockResolvedValue({ data: { id: "id" }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // GitHub issue #852。注文ではないため注文番号は付けない
  it("件名に注文番号を付けない", async () => {
    await sendWelcomeEmail(WELCOME_PARAMS);
    expect(sentTo("member@example.com").subject).toBe(
      "【EQ×Mart】ご入会ありがとうございます"
    );
  });
});
