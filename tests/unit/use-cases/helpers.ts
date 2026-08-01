import { vi } from "vitest";
import { User } from "@/domain/entities/user";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { Address } from "@/domain/entities/address";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import type { UserRepository } from "@/repositories/user-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { AddressRepository } from "@/repositories/address-repository";
import type {
  ProductRepository,
  ProductSnapshot,
} from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import type { AccountGateway } from "@/repositories/account-gateway";

export function makeUser(
  overrides?: Partial<{
    rank: string;
    onboardingCompleted: boolean;
    subscribedAt: Date | null;
  }>
) {
  return User.of({
    id: "00000000-0000-0000-0000-000000000001",
    clerkUserId: "clerk-1",
    email: "test@example.com",
    rank: MemberRank.of(overrides?.rank ?? "standard"),
    subscribedAt: overrides?.subscribedAt ?? new Date(2026, 0, 1),
    onboardingCompleted: overrides?.onboardingCompleted ?? true,
    deletedAt: null,
    termsAgreedAt: null,
    termsVersion: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
}

export function makeAddress(type: "shipping" | "billing" = "shipping") {
  return Address.of({
    id: `${type}-addr`,
    type,
    isDefault: true,
    recipientLastName: "山田",
    recipientFirstName: "太郎",
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    addressLine1: "千代田1-1",
    addressLine2: "",
    phoneNumber: "09012345678",
  });
}

export function makeAddressSnapshot() {
  return AddressSnapshot.of({
    recipientLastName: "山田",
    recipientFirstName: "太郎",
    postalCode: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    addressLine1: "千代田1-1",
    addressLine2: "",
    phoneNumber: "09012345678",
  });
}

export function makeOrderItem(
  overrides?: Partial<{
    isNegotiable: boolean;
    negotiatedUnitPrice: Money | null;
  }>
) {
  return OrderItem.of({
    id: "00000000-0000-0000-0000-000000000031",
    sanityProductId: "prod-1",
    productNameSnapshot: "テスト商品",
    unitPriceSnapshot: Money.of(100_000),
    quantity: 1,
    isNegotiable: overrides?.isNegotiable ?? false,
    negotiatedUnitPrice: overrides?.negotiatedUnitPrice ?? null,
  });
}

export function makeOrder(overrides?: {
  status?: string;
  paymentFlow?: "checkout" | "invoice";
  items?: OrderItem[];
  stripeCheckoutSessionId?: string | null;
  stripeInvoiceId?: string | null;
}) {
  return Order.of({
    id: "00000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000001",
    paymentFlow: overrides?.paymentFlow ?? "checkout",
    status: OrderStatus.of(overrides?.status ?? "pending_payment"),
    shippingAddress: makeAddressSnapshot(),
    billingAddress: makeAddressSnapshot(),
    rankAtOrder: MemberRank.of("standard"),
    monthlyLimitAtOrder: Money.of(5_000_000),
    stripeCheckoutSessionId: overrides?.stripeCheckoutSessionId ?? null,
    stripeInvoiceId: overrides?.stripeInvoiceId ?? null,
    items: overrides?.items ?? [makeOrderItem()],
    createdAt: new Date(2026, 5, 1),
  });
}

export const fixedProduct: ProductSnapshot = {
  sanityProductId: "prod-1",
  productName: "固定商品",
  unitPrice: Money.of(100_000),
  isNegotiable: false,
  minRank: "starter",
};

export const negotiableProduct: ProductSnapshot = {
  sanityProductId: "prod-2",
  productName: "交渉商品",
  unitPrice: Money.zero(),
  isNegotiable: true,
  minRank: "starter",
};

export function makeUserRepo(user = makeUser()): UserRepository {
  return {
    findByClerkUserId: vi.fn().mockResolvedValue(user),
    findById: vi.fn().mockResolvedValue(user),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

export function makeOrderRepo(order?: Order): OrderRepository {
  return {
    findById: vi.fn().mockResolvedValue(order ?? null),
    findByStripeCheckoutSessionId: vi.fn().mockResolvedValue(order ?? null),
    findByStripeInvoiceId: vi.fn().mockResolvedValue(order ?? null),
    sumConfirmedAmountByUserId: vi.fn().mockResolvedValue(0),
    save: vi.fn().mockResolvedValue(undefined),
    findActiveByUserId: vi.fn().mockResolvedValue([]),
    findActiveOrdersWithUser: vi.fn().mockResolvedValue([]),
    findByIdWithUser: vi.fn().mockResolvedValue(null),
  };
}

export function makeAddressRepo(): AddressRepository {
  return {
    findById: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          makeAddress(id.startsWith("billing") ? "billing" : "shipping")
        )
      ),
    findByUserId: vi.fn().mockResolvedValue([]),
    countByUserIdAndType: vi.fn().mockResolvedValue(0),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clearDefault: vi.fn().mockResolvedValue(undefined),
  };
}

export function makeProductRepo(
  products: ProductSnapshot[] = [fixedProduct]
): ProductRepository {
  return {
    findByIds: vi.fn().mockResolvedValue(products),
  };
}

export function makePaymentGateway(): PaymentGateway {
  return {
    createCheckoutSession: vi.fn().mockResolvedValue({
      sessionId: "sess_1",
      url: "https://stripe.com/pay/sess_1",
    }),
    createInvoiceForOrder: vi.fn().mockResolvedValue("inv_1"),
    ensureCustomer: vi.fn().mockResolvedValue("cus_1"),
  };
}

export function makeNotificationService(): NotificationService {
  return {
    sendOrderConfirming: vi.fn().mockResolvedValue(undefined),
    sendOrderOperatorNotification: vi.fn().mockResolvedValue(undefined),
    sendLimitExceeded: vi.fn().mockResolvedValue(undefined),
    sendShippingNotification: vi.fn().mockResolvedValue(undefined),
    sendDeliveryNotification: vi.fn().mockResolvedValue(undefined),
    sendCheckoutPaid: vi.fn().mockResolvedValue(undefined),
    sendInvoicePaid: vi.fn().mockResolvedValue(undefined),
  };
}

export function makeSubscriptionGateway(): SubscriptionGateway {
  return {
    cancelSubscription: vi.fn().mockResolvedValue(undefined),
  };
}

export function makeAccountGateway(): AccountGateway {
  return {
    deleteUser: vi.fn().mockResolvedValue(undefined),
    updateOnboardingMetadata: vi.fn().mockResolvedValue(undefined),
  };
}
