import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email/checkout-paid", () => ({
  sendCheckoutPaidEmails: vi.fn().mockResolvedValue(undefined),
}));

import { sendCheckoutPaidEmails } from "@/lib/email/checkout-paid";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { User } from "@/domain/entities/user";

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
  phoneNumber: "09012345678",
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
        quantity: 1,
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
    ],
    settlements: [settlement, otherSettlement],
    createdAt: new Date(2026, 8, 1),
  });
}

describe("ResendNotificationService.sendCheckoutPaid", () => {
  it("支払い済みの決済単位に紐づく明細のみをメールに含める（未払い明細は含めない）", async () => {
    const service = new ResendNotificationService();
    await service.sendCheckoutPaid(makeOrder(), settlement, user);

    expect(sendCheckoutPaidEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        lineItems: [expect.objectContaining({ productName: "支払い済み商品" })],
      })
    );
  });
});
