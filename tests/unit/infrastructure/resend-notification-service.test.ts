import { describe, it, expect, vi, beforeEach } from "vitest";

// Resend の SDK を呼ぶのは各 send* 関数（それぞれ tests/unit/email-sentry.test.ts で確かめている）。
// ここでは send* をモックし、このアダプタ自身のコード（ドメインのオブジェクトからメールの引数への変換）を確かめる
vi.mock("@/infrastructure/resend/order-confirming", () => ({
  sendOrderConfirmingEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/order-operator-notification", () => ({
  sendOrderOperatorNotification: vi.fn().mockResolvedValue(undefined),
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
  sendCheckoutPaidEmails: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/infrastructure/resend/invoice-paid", () => ({
  sendInvoicePaidEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendOrderConfirmingEmail } from "@/infrastructure/resend/order-confirming";
import { sendOrderOperatorNotification } from "@/infrastructure/resend/order-operator-notification";
import { sendLimitExceededEmail } from "@/infrastructure/resend/limit-exceeded";
import { sendShippingNotificationEmail } from "@/infrastructure/resend/shipping-notification";
import { sendDeliveryNotificationEmail } from "@/infrastructure/resend/delivery-notification";
import { sendCheckoutPaidEmails } from "@/infrastructure/resend/checkout-paid";
import { sendInvoicePaidEmail } from "@/infrastructure/resend/invoice-paid";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { User } from "@/domain/entities/user";
import type { ProductSnapshot } from "@/repositories/product-repository";

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

const user = User.of({
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
});

const settlement = OrderSettlement.of({
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

const otherSettlement = OrderSettlement.of({
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
  return Order.of({
    id: "order-1",
    userId: "user-1",
    status: OrderStatus.of("processing"),
    shippingAddress: addressSnapshot,
    billingAddress: addressSnapshot,
    rankAtOrder: MemberRank.of("standard"),
    monthlyLimitAtOrder: Money.of(5_000_000),
    items: [
      OrderItem.of({
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
      OrderItem.of({
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
      OrderItem.of({
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
        lineItems: expectedLineItems,
      });
    });
  });

  describe("sendOrderOperatorNotification", () => {
    it("注文者のメールアドレスと、注文の数量と商品の単価（価格応談はnull）で作った明細を渡す", async () => {
      await service.sendOrderOperatorNotification(
        makeOrder(),
        "customer@example.com",
        items
      );

      expect(sendOrderOperatorNotification).toHaveBeenCalledWith({
        orderId: "order-1",
        customerEmail: "customer@example.com",
        lineItems: expectedLineItems,
      });
    });
  });

  describe("sendLimitExceeded", () => {
    it("宛先と注文IDをそのまま渡す", async () => {
      await service.sendLimitExceeded("test@example.com", "order-1");

      expect(sendLimitExceededEmail).toHaveBeenCalledWith({
        to: "test@example.com",
        orderId: "order-1",
      });
    });
  });

  describe("sendShippingNotification", () => {
    it("注文IDと会員のメールアドレスをそのまま渡す", async () => {
      await service.sendShippingNotification("order-1", "test@example.com");

      expect(sendShippingNotificationEmail).toHaveBeenCalledWith({
        orderId: "order-1",
        memberEmail: "test@example.com",
      });
    });
  });

  describe("sendDeliveryNotification", () => {
    it("注文IDと会員のメールアドレスをそのまま渡す", async () => {
      await service.sendDeliveryNotification("order-1", "test@example.com");

      expect(sendDeliveryNotificationEmail).toHaveBeenCalledWith({
        orderId: "order-1",
        memberEmail: "test@example.com",
      });
    });
  });

  describe("sendCheckoutPaid", () => {
    it("支払い済みの決済単位に紐づく明細のみをメールに含める（未払い明細は含めない）", async () => {
      await service.sendCheckoutPaid(makeOrder(), settlement, user);

      expect(sendCheckoutPaidEmails).toHaveBeenCalledWith({
        orderId: "order-1",
        memberEmail: "test@example.com",
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

  describe("sendInvoicePaid", () => {
    it("注文IDと会員のメールアドレスを渡す", async () => {
      await service.sendInvoicePaid(makeOrder(), user);

      expect(sendInvoicePaidEmail).toHaveBeenCalledWith({
        orderId: "order-1",
        memberEmail: "test@example.com",
      });
    });
  });
});
