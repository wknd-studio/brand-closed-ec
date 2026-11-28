import { describe, it, expect, vi, beforeEach } from "vitest";

// Resend の SDK を呼ぶのは各 send* 関数（それぞれ tests/unit/email-sentry.test.ts で確かめている）。
// ここでは send* をモックし、このアダプタ自身のコード（ドメインのオブジェクトからメールの引数への変換）を確かめる
vi.mock("@/infrastructure/resend/order-confirming", () => ({
  sendOrderConfirmingEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/limit-exceeded", () => ({
  sendLimitExceededEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/shipping-notification", () => ({
  sendShippingNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/delivery-notification", () => ({
  sendDeliveryNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/checkout-paid", () => ({
  sendCheckoutPaidEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/welcome", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/withdrawn", () => ({
  sendWithdrawnEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendCheckoutPaidEmail } from "@/infrastructure/resend/checkout-paid";
import { sendWelcomeEmail } from "@/infrastructure/resend/welcome";
import { sendWithdrawnEmail } from "@/infrastructure/resend/withdrawn";
import { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { reconstituteOrder } from "@/domain/entities/order";
import { reconstituteOrderItem } from "@/domain/entities/order-item";
import { reconstituteOrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { reconstituteUser } from "@/domain/entities/user";
import type { ProductSnapshot } from "@/repositories/product-repository";
import { OrderNumber } from "@/domain/value-objects/order-number";

const addressSnapshot = AddressSnapshot.of({
  recipientLastName: "テスト",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
});

const user = reconstituteUser({
  id: "user-1",
  clerkUserId: "clerk-1",
  email: "test@example.com",
  firstName: "太郎",
  lastName: "テスト",
  phoneNumber: PhoneNumber.of("09012345678"),
  profileCompletedAt: new Date(2026, 0, 1),
  rank: MemberRank.of("standard"),
  billingAnchorDay: 1,
  onboardingCompleted: true,
  deletedAt: null,
  stripeCustomerId: null,
  createdAt: new Date(2026, 0, 1),
});

const settlement = reconstituteOrderSettlement({
  id: "settlement-paid",
  orderId: "order-1",
  flow: "checkout",
  status: "paid",
  stripeCheckoutSessionId: "cs_1",
  stripeInvoiceId: null,
  amount: Money.of(10_000),
  paidAt: new Date(),
  cancelledAt: null,
});

const otherSettlement = reconstituteOrderSettlement({
  id: "settlement-other",
  orderId: "order-1",
  flow: "checkout",
  status: "pending_payment",
  stripeCheckoutSessionId: "cs_2",
  stripeInvoiceId: null,
  amount: Money.of(5_000),
  paidAt: null,
  cancelledAt: null,
});

function makeOrder() {
  return reconstituteOrder({
    id: "order-1",
    userId: "user-1",
    orderNumber: OrderNumber.of("K7Q2M9XD"),
    status: OrderStatus.of("processing"),
    shippingAddress: addressSnapshot,
    billingAddress: addressSnapshot,
    rankAtOrder: MemberRank.of("standard"),
    monthlyLimitAtOrder: MonthlyLimit.of(5_000_000),
    items: [
      reconstituteOrderItem({
        id: "item-paid",
        sanityProductId: "prod-1",
        productNameSnapshot: "支払い済み商品",
        unitPriceSnapshot: Money.of(10_000),
        quantity: 2,
        isNegotiable: false,
        negotiatedUnitPrice: null,
        paymentTiming: "at_order",
        settlementId: "settlement-paid",
      }),
      reconstituteOrderItem({
        id: "item-unpaid",
        sanityProductId: "prod-2",
        productNameSnapshot: "未払いの後払い商品",
        unitPriceSnapshot: Money.of(5_000),
        quantity: 1,
        isNegotiable: false,
        negotiatedUnitPrice: null,
        paymentTiming: "after_order",
        settlementId: null,
      }),
      reconstituteOrderItem({
        id: "item-negotiable",
        sanityProductId: "prod-3",
        productNameSnapshot: "価格応談の商品",
        unitPriceSnapshot: Money.of(0),
        quantity: 3,
        isNegotiable: true,
        negotiatedUnitPrice: null,
        paymentTiming: "at_order",
        settlementId: "settlement-paid",
      }),
    ],
    settlements: [settlement, otherSettlement],
    createdAt: new Date(2026, 8, 1),
  });
}

function snapshot(
  props: Pick<ProductSnapshot, "sanityProductId" | "productName"> &
    Partial<ProductSnapshot>
): ProductSnapshot {
  return {
    unitPrice: Money.of(10_000),
    isNegotiable: false,
    minRank: "standard",
    availability: "available",
    paymentTiming: "at_order",
    ...props,
  };
}

// 注文の明細と商品の情報を突き合わせた、メールに載せる明細
const items = [
  snapshot({ sanityProductId: "prod-1", productName: "商品A" }),
  snapshot({
    sanityProductId: "prod-3",
    productName: "価格応談の商品",
    unitPrice: Money.of(0),
    isNegotiable: true,
  }),
  // 注文の明細に無い商品は、数量1として載せる
  snapshot({
    sanityProductId: "prod-x",
    productName: "注文に無い商品",
    unitPrice: Money.of(3_000),
  }),
];

const expectedLineItems = [
  { productName: "商品A", quantity: 2, unitPrice: 10_000, isNegotiable: false },
  {
    productName: "価格応談の商品",
    quantity: 3,
    unitPrice: null,
    isNegotiable: true,
  },
  {
    productName: "注文に無い商品",
    quantity: 1,
    unitPrice: 3_000,
    isNegotiable: false,
  },
];

describe("ResendNotificationService", () => {
  const service = new ResendNotificationService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendOrderConfirming", () => {
    it("会員のメールアドレス宛てに、注文の数量と商品の単価（価格応談はnull）で明細を作って送る", async () => {
      await service.sendOrderConfirming(makeOrder(), user, items);

      expect(sendOrderConfirmingEmail).toHaveBeenCalledWith({
        to: "test@example.com",
        orderId: "order-1",
        orderNumber: OrderNumber.of("K7Q2M9XD"),
        orderedAt: new Date(2026, 8, 1),
        lineItems: expectedLineItems,
        // 載せる明細（商品A ¥10,000 × 2・注文に無い商品 ¥3,000 × 1）の固定額の合計。
        // 合計を明細と別のもの（注文の後払いの明細 ¥5,000）から作ると、表と合計が食い違う
        fixedTotal: 23_000,
      });
    });
  });

  describe("sendLimitExceeded", () => {
    it("宛先・注文ID・注文番号をそのまま渡す", async () => {
      await service.sendLimitExceeded(
        "test@example.com",
        "order-1",
        OrderNumber.of("K7Q2M9XD")
      );

      expect(sendLimitExceededEmail).toHaveBeenCalledWith({
        to: "test@example.com",
        orderId: "order-1",
        orderNumber: OrderNumber.of("K7Q2M9XD"),
      });
    });
  });

  describe("sendShippingNotification", () => {
    it("注文ID・注文番号・会員のメールアドレスをそのまま渡す", async () => {
      await service.sendShippingNotification(
        "order-1",
        OrderNumber.of("K7Q2M9XD"),
        "test@example.com"
      );

      expect(sendShippingNotificationEmail).toHaveBeenCalledWith({
        orderId: "order-1",
        orderNumber: OrderNumber.of("K7Q2M9XD"),
        memberEmail: "test@example.com",
      });
    });
  });

  describe("sendDeliveryNotification", () => {
    it("注文ID・注文番号・会員のメールアドレスをそのまま渡す", async () => {
      await service.sendDeliveryNotification(
        "order-1",
        OrderNumber.of("K7Q2M9XD"),
        "test@example.com"
      );

      expect(sendDeliveryNotificationEmail).toHaveBeenCalledWith({
        orderId: "order-1",
        orderNumber: OrderNumber.of("K7Q2M9XD"),
        memberEmail: "test@example.com",
      });
    });
  });

  describe("sendCheckoutPaid", () => {
    it("支払い済みの決済単位に紐づく明細のみをメールに含める（未払い明細は含めない）", async () => {
      await service.sendCheckoutPaid(makeOrder(), settlement, user);

      expect(sendCheckoutPaidEmail).toHaveBeenCalledWith({
        orderId: "order-1",
        orderNumber: OrderNumber.of("K7Q2M9XD"),
        orderedAt: new Date(2026, 8, 1),
        memberEmail: "test@example.com",
        // 支払い済みの決済単位の明細のうち、要相談を除いた固定額（¥10,000 × 2）
        fixedTotal: 20_000,
        lineItems: [
          {
            productName: "支払い済み商品",
            quantity: 2,
            unitPrice: 10_000,
            isNegotiable: false,
          },
          {
            productName: "価格応談の商品",
            quantity: 3,
            unitPrice: null,
            isNegotiable: true,
          },
        ],
      });
    });
  });

  // GitHub issue #852
  describe("sendWelcome", () => {
    it("会員のメールアドレス宛てに、ランク・上限・金額・次回の請求日・退会できる日を渡す", async () => {
      const minimumPeriod = MinimumMembershipPeriod.startingAt(
        new Date("2026-11-28T03:00:00Z")
      );

      await service.sendWelcome(user, {
        rank: MemberRank.of("standard"),
        monthlyLimit: MonthlyLimit.of(5_000_000),
        initialFee: Money.of(30_000),
        monthlyFee: Money.of(30_000),
        nextPaymentAt: new Date("2026-12-28T01:00:00Z"),
        minimumPeriod,
      });

      expect(sendWelcomeEmail).toHaveBeenCalledWith({
        to: "test@example.com",
        rank: "standard",
        monthlyLimit: 5_000_000,
        initialFee: 30_000,
        monthlyFee: 30_000,
        nextPaymentAt: new Date("2026-12-28T01:00:00Z"),
        withdrawableFrom: minimumPeriod.withdrawableFrom,
      });
    });

    it("上限が無いランクは上限を null で渡す", async () => {
      await service.sendWelcome(user, {
        rank: MemberRank.of("standard"),
        monthlyLimit: MonthlyLimit.unlimited(),
        initialFee: Money.of(30_000),
        monthlyFee: Money.of(30_000),
        nextPaymentAt: new Date("2026-12-28T01:00:00Z"),
        minimumPeriod: MinimumMembershipPeriod.startingAt(new Date()),
      });

      expect(sendWelcomeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ monthlyLimit: null })
      );
    });
  });

  // GitHub issue #853
  describe("sendWithdrawn", () => {
    it("会員のメールアドレス宛てに、退会日とサブスクリプションを解約したかを渡す", async () => {
      const withdrawnAt = new Date("2027-06-10T00:00:00Z");

      await service.sendWithdrawn(user, {
        withdrawnAt,
        subscriptionCancelled: true,
      });

      expect(sendWithdrawnEmail).toHaveBeenCalledWith({
        to: "test@example.com",
        withdrawnAt,
        subscriptionCancelled: true,
      });
    });
  });
});
