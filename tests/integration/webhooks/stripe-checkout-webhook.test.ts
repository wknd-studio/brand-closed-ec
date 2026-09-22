import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder } from "@/use-cases/place-order";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import type { ProductRepository } from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import { Money } from "@/domain/value-objects/money";
import { getStripe } from "@/lib/stripe";
import { POST } from "@/app/api/webhooks/stripe/route";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000070";
const TEST_CLERK_ID = "clerk_test_stripe_checkout_webhook";
const TEST_ADDRESS_ID = "00000000-0000-0000-0000-000000000071";
const TEST_SESSION_ID = "cs_test_stripe_checkout_webhook_070";

async function cleanup() {
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", TEST_USER_ID);
  const orderIds = orders?.map((o) => o.id) ?? [];
  if (orderIds.length > 0) {
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("order_settlements").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }
  await supabase.from("addresses").delete().eq("id", TEST_ADDRESS_ID);
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  await supabase
    .from("stripe_webhook_events")
    .delete()
    .in("event_id", [
      "evt_test_stripe_checkout_webhook",
      "evt_test_stripe_checkout_webhook_retry",
    ]);
}

function makeDeps() {
  const productRepo: ProductRepository = {
    findByIds: vi.fn().mockResolvedValue([
      {
        sanityProductId: "prod-test",
        productName: "テスト商品",
        unitPrice: Money.of(58_000),
        isNegotiable: false,
        minRank: "starter",
        paymentTiming: "at_order",
      },
    ]),
  };
  const paymentGateway: PaymentGateway = {
    createCheckoutSession: vi.fn().mockResolvedValue({
      sessionId: TEST_SESSION_ID,
      url: "https://checkout.stripe.com/test",
    }),
    createInvoiceForOrder: vi.fn(),
    ensureCustomer: vi.fn(),
  };
  const notificationService: NotificationService = {
    sendOrderConfirming: vi.fn().mockResolvedValue(undefined),
    sendOrderOperatorNotification: vi.fn().mockResolvedValue(undefined),
    sendLimitExceeded: vi.fn(),
    sendShippingNotification: vi.fn(),
    sendDeliveryNotification: vi.fn(),
    sendCheckoutPaid: vi.fn().mockResolvedValue(undefined),
    sendInvoicePaid: vi.fn(),
  };
  return { productRepo, paymentGateway, notificationService };
}

beforeAll(async () => {
  await cleanup();

  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "stripe-checkout-webhook-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "starter",
    onboarding_completed: true,
    billing_anchor_day: 1,
  });

  await supabase.from("addresses").insert({
    id: TEST_ADDRESS_ID,
    user_id: TEST_USER_ID,
    type: "shipping",
    recipient_last_name: "テスト",
    recipient_first_name: "太郎",
    postal_code: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    address_line1: "丸の内1-1-1",
    phone_number: "03-1234-5678",
    is_default: true,
  });

  const userRepo = new SupabaseUserRepository(supabase);
  const orderRepo = new SupabaseOrderRepository(supabase);
  const addressRepo = new SupabaseAddressRepository(supabase);
  const { productRepo, paymentGateway, notificationService } = makeDeps();

  // 実際にplaceOrderユースケース経由で注文（Checkout決済単位: pending_payment、stripeCheckoutSessionIdあり）を作成する
  await placeOrder(
    {
      clerkUserId: TEST_CLERK_ID,
      cartItems: [
        {
          sanityProductId: "prod-test",
          quantity: 1,
          productName: "テスト商品",
        },
      ],
      shippingAddressId: TEST_ADDRESS_ID,
      billingAddressId: TEST_ADDRESS_ID,
      baseUrl: "http://localhost:3000",
    },
    {
      userRepo,
      orderRepo,
      addressRepo,
      productRepo,
      paymentGateway,
      notificationService,
    }
  );
});

afterAll(async () => {
  await cleanup();
});

describe("Stripe Checkout決済確定Webhook（実DB・署名検証込み）", () => {
  it("checkout.session.completed（mode: payment）を受信すると、対象の決済単位と注文がpaidになる", async () => {
    const { data: before } = await supabase
      .from("orders")
      .select("status, order_settlements(status)")
      .eq("user_id", TEST_USER_ID)
      .single();
    expect(before?.status).toBe("processing");
    expect(before?.order_settlements[0]?.status).toBe("pending_payment");

    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: "evt_test_stripe_checkout_webhook",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: TEST_SESSION_ID,
          object: "checkout.session",
          mode: "payment",
        },
      },
    });
    const signature = getStripe().webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      })
    );

    expect(response.status).toBe(200);

    const { data: after } = await supabase
      .from("orders")
      .select("status, order_settlements(status, paid_at)")
      .eq("user_id", TEST_USER_ID)
      .single();
    expect(after?.status).toBe("paid");
    expect(after?.order_settlements[0]?.status).toBe("paid");
    expect(after?.order_settlements[0]?.paid_at).not.toBeNull();

    const { data: webhookEvent } = await supabase
      .from("stripe_webhook_events")
      .select("status, processed_at")
      .eq("event_id", "evt_test_stripe_checkout_webhook")
      .single();
    expect(webhookEvent?.status).toBe("processed");
    expect(webhookEvent?.processed_at).not.toBeNull();
  });

  it("同一event_idの再送はDBレベルの冪等性チェックでスキップされる（issue #221）", async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: "evt_test_stripe_checkout_webhook",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: TEST_SESSION_ID,
          object: "checkout.session",
          mode: "payment",
        },
      },
    });
    const signature = getStripe().webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, skipped: true });
  });

  it("同じ決済単位への異なるevent_idの再送も冪等（paid_atが変わらず200を返す）", async () => {
    const { data: before } = await supabase
      .from("order_settlements")
      .select("paid_at, order_id")
      .eq("stripe_checkout_session_id", TEST_SESSION_ID)
      .single();

    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: "evt_test_stripe_checkout_webhook_retry",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: TEST_SESSION_ID,
          object: "checkout.session",
          mode: "payment",
        },
      },
    });
    const signature = getStripe().webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      })
    );
    expect(response.status).toBe(200);

    const { data: after } = await supabase
      .from("order_settlements")
      .select("paid_at")
      .eq("stripe_checkout_session_id", TEST_SESSION_ID)
      .single();
    expect(after?.paid_at).toBe(before?.paid_at);
  });
});
