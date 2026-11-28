import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder, type PlaceOrderDeps } from "@/use-cases/place-order";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseMemberRankRepository } from "@/infrastructure/supabase/supabase-member-rank-repository";
import { SupabaseSubscriptionRepository } from "@/infrastructure/supabase/supabase-subscription-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import type { ProductRepository } from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import { Money } from "@/domain/value-objects/money";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { getStripe } from "@/infrastructure/stripe/client";
import { POST } from "@/app/api/webhooks/stripe/route";

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// starter の月次上限（member_ranks）は300,000円。200,000円の注文は2件目で上限を超える
const TEST_USER_ID = "00000000-0000-0000-0000-000000000202";
const TEST_CLERK_ID = "clerk_test_stripe_checkout_expired_webhook";
const TEST_ADDRESS_ID = "00000000-0000-0000-0000-000000000203";
const EXPIRED_SESSION_ID = "cs_test_stripe_checkout_expired_202";
const UNKNOWN_SESSION_ID = "cs_test_stripe_checkout_expired_202_unknown";
const NEXT_SESSION_ID = "cs_test_stripe_checkout_expired_202_next";
const EVENT_PREFIX = "evt_test_stripe_checkout_expired_202";

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
    .like("event_id", `${EVENT_PREFIX}%`);
}

function makeDeps(sessionId: string): PlaceOrderDeps {
  const productRepo: ProductRepository = {
    findByIds: vi.fn().mockResolvedValue([
      {
        sanityProductId: "prod-test",
        productName: "テスト商品",
        unitPrice: Money.of(200_000),
        isNegotiable: false,
        minRank: "starter",
        availability: "available",
        paymentTiming: "at_order",
      },
    ]),
  };
  const paymentGateway: PaymentGateway = {
    createCheckoutSession: vi.fn().mockResolvedValue({
      sessionId,
      url: "https://checkout.stripe.com/test",
    }),
    createInvoiceForOrder: vi.fn(),
  };
  const notificationService: NotificationService = {
    sendOrderConfirming: vi.fn().mockResolvedValue(undefined),
    sendLimitExceeded: vi.fn(),
    sendShippingNotification: vi.fn(),
    sendDeliveryNotification: vi.fn(),
    sendCheckoutPaid: vi.fn().mockResolvedValue(undefined),
    sendWelcome: vi.fn(),
    sendWithdrawn: vi.fn(),
  };
  return {
    userRepo: new SupabaseUserRepository(supabase),
    orderRepo: new SupabaseOrderRepository(supabase),
    addressRepo: new SupabaseAddressRepository(supabase),
    memberRankRepo: new SupabaseMemberRankRepository(supabase),
    subscriptionRepo: new SupabaseSubscriptionRepository(supabase),
    productRepo,
    paymentGateway,
    notificationService,
    operatorNotifier: { notify: vi.fn().mockResolvedValue(undefined) },
    errorReporter: { captureException: vi.fn(), captureMessage: vi.fn() },
  };
}

function placeTestOrder(sessionId: string) {
  return placeOrder(
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
    makeDeps(sessionId)
  );
}

function postWebhook(eventId: string, type: string, sessionId: string) {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type,
    data: {
      object: { id: sessionId, object: "checkout.session", mode: "payment" },
    },
  });
  const signature = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return POST(
    new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    })
  );
}

async function findOrderBySession(sessionId: string) {
  const { data: settlement } = await supabase
    .from("order_settlements")
    .select("order_id")
    .eq("stripe_checkout_session_id", sessionId)
    .single();
  const { data } = await supabase
    .from("orders")
    .select("id, status, order_settlements(status, paid_at, cancelled_at)")
    .eq("id", settlement!.order_id)
    .single();
  return data!;
}

beforeAll(async () => {
  await cleanup();

  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "stripe-checkout-expired-webhook-test@example.com",
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

  // 決済されずに放置される注文（Checkout決済単位: pending_payment）
  await placeTestOrder(EXPIRED_SESSION_ID);
});

afterAll(async () => {
  await cleanup();
});

describe("Stripe Checkoutの期限切れWebhook（checkout.session.expired・実DB・署名検証込み）", () => {
  it("放置された注文が月次上限の枠を使っているあいだは、同じ会員の次の注文が上限超過で弾かれる", async () => {
    await expect(placeTestOrder(NEXT_SESSION_ID)).rejects.toThrow(
      LimitExceededError
    );
  });

  it("期限切れを受信すると、決済単位がcancelled（cancelled_atあり）になり、注文もcancelledになってsystemとして記録される", async () => {
    const response = await postWebhook(
      `${EVENT_PREFIX}_expired`,
      "checkout.session.expired",
      EXPIRED_SESSION_ID
    );
    expect(response.status).toBe(200);

    const order = await findOrderBySession(EXPIRED_SESSION_ID);
    expect(order.status).toBe("cancelled");
    expect(order.order_settlements[0]?.status).toBe("cancelled");
    expect(order.order_settlements[0]?.cancelled_at).not.toBeNull();

    const { data: history } = await supabase
      .from("order_status_changes")
      .select("from_status, to_status, changed_by, changed_by_admin_user_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    expect(history).toEqual([
      {
        from_status: null,
        to_status: "processing",
        changed_by: "customer",
        changed_by_admin_user_id: null,
      },
      {
        from_status: "processing",
        to_status: "cancelled",
        changed_by: "system",
        changed_by_admin_user_id: null,
      },
    ]);

    const { data: webhookEvent } = await supabase
      .from("stripe_webhook_events")
      .select("status")
      .eq("event_id", `${EVENT_PREFIX}_expired`)
      .single();
    expect(webhookEvent?.status).toBe("processed");
  });

  it("同じイベントの再配信は、stripe_webhook_eventsによりスキップされ二重に処理されない", async () => {
    const before = await findOrderBySession(EXPIRED_SESSION_ID);

    const response = await postWebhook(
      `${EVENT_PREFIX}_expired`,
      "checkout.session.expired",
      EXPIRED_SESSION_ID
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, skipped: true });

    const after = await findOrderBySession(EXPIRED_SESSION_ID);
    expect(after.order_settlements[0]?.cancelled_at).toBe(
      before.order_settlements[0]?.cancelled_at
    );
    const { count } = await supabase
      .from("order_status_changes")
      .select("id", { count: "exact", head: true })
      .eq("order_id", before.id);
    expect(count).toBe(2);
  });

  it("キャンセル後は、その明細が月次上限の確定額から外れ、同じ会員が枠を使って注文できる", async () => {
    await placeTestOrder(NEXT_SESSION_ID);

    const next = await findOrderBySession(NEXT_SESSION_ID);
    expect(next.order_settlements[0]?.status).toBe("pending_payment");
  });

  it("すでにpaidの決済単位には、期限切れを受信しても何もしない", async () => {
    // 2件目の注文を支払い済みにしてから、その注文の期限切れを受信する
    const completed = await postWebhook(
      `${EVENT_PREFIX}_completed`,
      "checkout.session.completed",
      NEXT_SESSION_ID
    );
    expect(completed.status).toBe(200);
    const before = await findOrderBySession(NEXT_SESSION_ID);
    expect(before.status).toBe("paid");

    const response = await postWebhook(
      `${EVENT_PREFIX}_expired_paid`,
      "checkout.session.expired",
      NEXT_SESSION_ID
    );
    expect(response.status).toBe(200);

    const after = await findOrderBySession(NEXT_SESSION_ID);
    expect(after.status).toBe("paid");
    expect(after.order_settlements[0]?.status).toBe("paid");
    expect(after.order_settlements[0]?.cancelled_at).toBeNull();
    expect(after.order_settlements[0]?.paid_at).toBe(
      before.order_settlements[0]?.paid_at
    );
  });

  it("注文に紐付いていないセッションの期限切れは、何もせず200を返す", async () => {
    const response = await postWebhook(
      `${EVENT_PREFIX}_unknown`,
      "checkout.session.expired",
      UNKNOWN_SESSION_ID
    );
    expect(response.status).toBe(200);
  });
});
