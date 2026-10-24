import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
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

// mode=subscriptionの入会確定で呼ばれるClerkのmetadata更新（外部API）だけを差し替える
const { updateUserMetadataMock } = vi.hoisted(() => ({
  updateUserMetadataMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: { updateUserMetadata: updateUserMetadataMock },
  }),
}));

// 運営者への通知（Sentryへの送信）を確認するため差し替える
const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: captureMessageMock,
  captureException: vi.fn(),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

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
      "evt_test_stripe_checkout_webhook_processing",
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

  it("処理中（processing）のイベントの再送は409を返し、Stripeに後で再送させる（issue #424）", async () => {
    const eventId = "evt_test_stripe_checkout_webhook_processing";
    // 別のリクエストが処理中の状態を作る（claim直後・10分以内）
    const { error } = await supabase.from("stripe_webhook_events").insert({
      event_id: eventId,
      type: "checkout.session.completed",
      payload: {},
      status: "processing",
    });
    if (error) throw error;

    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: eventId,
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

    expect(response.status).toBe(409);

    const { data: webhookEvent } = await supabase
      .from("stripe_webhook_events")
      .select("status")
      .eq("event_id", eventId)
      .single();
    expect(webhookEvent?.status).toBe("processing");
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

describe("Stripe Checkout入会確定Webhook（mode: subscription・実DB・署名検証込み）", () => {
  const ONBOARDING_USER_ID = "00000000-0000-0000-0000-000000000364";
  const ONBOARDING_CLERK_ID = "clerk_test_stripe_checkout_webhook_onboarding";
  const ONBOARDING_SUBSCRIPTION_ID = "sub_test_stripe_checkout_webhook_364";
  const ONBOARDING_CUSTOMER_ID = "cus_test_stripe_checkout_webhook_364";
  const OTHER_SUBSCRIPTION_ID = "sub_test_stripe_checkout_webhook_413_other";
  const EVENT_PREFIX = "evt_test_stripe_checkout_webhook_onboarding";

  async function cleanupOnboarding() {
    await supabase
      .from("rank_changes")
      .delete()
      .eq("user_id", ONBOARDING_USER_ID);
    await supabase
      .from("subscriptions")
      .delete()
      .eq("user_id", ONBOARDING_USER_ID);
    await supabase.from("users").delete().eq("id", ONBOARDING_USER_ID);
    await supabase
      .from("stripe_webhook_events")
      .delete()
      .like("event_id", `${EVENT_PREFIX}%`);
  }

  function postSubscriptionCompleted(
    eventId: string,
    session: Record<string, unknown> = {}
  ) {
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_stripe_checkout_webhook_364",
          object: "checkout.session",
          mode: "subscription",
          payment_status: "paid",
          customer: ONBOARDING_CUSTOMER_ID,
          subscription: ONBOARDING_SUBSCRIPTION_ID,
          metadata: { clerk_user_id: ONBOARDING_CLERK_ID, plan: "standard" },
          ...session,
        },
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

  async function findOnboardingState() {
    const { data: user } = await supabase
      .from("users")
      .select("rank_code, onboarding_completed")
      .eq("id", ONBOARDING_USER_ID)
      .single();
    const { count: subscriptionCount } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ONBOARDING_USER_ID);
    return { user, subscriptionCount };
  }

  async function findEventStatus(eventId: string) {
    const { data } = await supabase
      .from("stripe_webhook_events")
      .select("status")
      .eq("event_id", eventId)
      .maybeSingle();
    return data?.status ?? null;
  }

  let retrieveSubscriptionMock: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    await cleanupOnboarding();
    const { error } = await supabase.from("users").insert({
      id: ONBOARDING_USER_ID,
      clerk_user_id: ONBOARDING_CLERK_ID,
      email: "stripe-checkout-webhook-onboarding-test@example.com",
      first_name: "テスト",
      last_name: "花子",
      rank_code: "starter",
      onboarding_completed: false,
    });
    if (error) throw error;

    // Stripe APIへの問い合わせ（Subscriptionの取得）だけを差し替える
    retrieveSubscriptionMock = vi
      .spyOn(getStripe().subscriptions, "retrieve")
      .mockImplementation(
        async (id: string) =>
          ({
            id,
            status: "active",
            // JST 2026-10-18 05:00（UTCでは10/17）
            start_date: Math.floor(
              new Date("2026-10-17T20:00:00Z").getTime() / 1000
            ),
            items: {
              data: [
                {
                  current_period_start: Math.floor(
                    new Date("2026-10-18T00:00:00Z").getTime() / 1000
                  ),
                  current_period_end: Math.floor(
                    new Date("2026-11-18T00:00:00Z").getTime() / 1000
                  ),
                },
              ],
            },
          }) as never
      );
  });

  beforeEach(() => {
    captureMessageMock.mockClear();
    updateUserMetadataMock.mockClear();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanupOnboarding();
  });

  it.each([
    ["metadataが無い", { metadata: {} }],
    ["clerk_user_idが無い", { metadata: { plan: "standard" } }],
    [
      "planが有効な値でない",
      { metadata: { clerk_user_id: ONBOARDING_CLERK_ID, plan: "gold" } },
    ],
    [
      "planがセルフサービスで申し込めないenterprise",
      { metadata: { clerk_user_id: ONBOARDING_CLERK_ID, plan: "enterprise" } },
    ],
  ])(
    "%sセッションは、Sentryにwarningを送って200を返し、入会を確定させない",
    async (_label, session) => {
      const response = await postSubscriptionCompleted(
        `${EVENT_PREFIX}_invalid_metadata`,
        session
      );
      expect(response.status).toBe(200);

      expect(captureMessageMock).toHaveBeenCalledTimes(1);
      expect(captureMessageMock.mock.calls[0][1]).toMatchObject({
        level: "warning",
        extra: {
          stripeCheckoutSessionId: "cs_test_stripe_checkout_webhook_364",
        },
      });
      expect(await findOnboardingState()).toEqual({
        user: { rank_code: "starter", onboarding_completed: false },
        subscriptionCount: 0,
      });
    }
  );

  it.each(["unpaid", "no_payment_required"])(
    "payment_statusが%sのセッションは、Sentryにwarningを送って200を返し、入会を確定させない",
    async (paymentStatus) => {
      const response = await postSubscriptionCompleted(
        `${EVENT_PREFIX}_unpaid`,
        { payment_status: paymentStatus }
      );
      expect(response.status).toBe(200);

      expect(captureMessageMock).toHaveBeenCalledTimes(1);
      expect(captureMessageMock.mock.calls[0][1]).toMatchObject({
        level: "warning",
        extra: { paymentStatus },
      });
      expect(await findOnboardingState()).toEqual({
        user: { rank_code: "starter", onboarding_completed: false },
        subscriptionCount: 0,
      });
      expect(updateUserMetadataMock).not.toHaveBeenCalled();
    }
  );

  it("処理に失敗したら500を返してイベントをfailedにし、入会は確定しない", async () => {
    retrieveSubscriptionMock.mockRejectedValueOnce(
      new Error("Stripe API error")
    );

    const response = await postSubscriptionCompleted(EVENT_PREFIX);
    expect(response.status).toBe(500);

    expect(await findEventStatus(EVENT_PREFIX)).toBe("failed");
    expect(await findOnboardingState()).toEqual({
      user: { rank_code: "starter", onboarding_completed: false },
      subscriptionCount: 0,
    });
  });

  it("失敗したイベントの再送は再処理され、initial_fee_paid_rank_codeと入会時のrank_changesを記録し、subscriptionsを作成する", async () => {
    const response = await postSubscriptionCompleted(EVENT_PREFIX);
    expect(response.status).toBe(200);
    expect(await findEventStatus(EVENT_PREFIX)).toBe("processed");

    const { data: user } = await supabase
      .from("users")
      .select(
        "rank_code, initial_fee_paid_rank_code, stripe_customer_id, onboarding_completed, billing_anchor_day"
      )
      .eq("id", ONBOARDING_USER_ID)
      .single();
    expect(user).toMatchObject({
      rank_code: "standard",
      initial_fee_paid_rank_code: "standard",
      stripe_customer_id: ONBOARDING_CUSTOMER_ID,
      onboarding_completed: true,
    });
    // サブスクリプションの開始日時（start_date）のJSTの日付
    expect(user?.billing_anchor_day).toBe(18);

    const { data: subscriptions } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, status, rank_code")
      .eq("user_id", ONBOARDING_USER_ID);
    expect(subscriptions).toEqual([
      {
        stripe_subscription_id: ONBOARDING_SUBSCRIPTION_ID,
        status: "active",
        rank_code: "standard",
      },
    ]);

    const { data: rankChanges } = await supabase
      .from("rank_changes")
      .select(
        "from_rank_code, to_rank_code, changed_by, initial_fee_charged, stripe_subscription_id"
      )
      .eq("user_id", ONBOARDING_USER_ID);
    expect(rankChanges).toEqual([
      {
        from_rank_code: null,
        to_rank_code: "standard",
        changed_by: "member",
        initial_fee_charged: true,
        stripe_subscription_id: ONBOARDING_SUBSCRIPTION_ID,
      },
    ]);

    expect(updateUserMetadataMock).toHaveBeenCalledWith(ONBOARDING_CLERK_ID, {
      publicMetadata: { onboarding_completed: true },
    });
  });

  it("処理済みのイベントの再送はスキップする", async () => {
    const response = await postSubscriptionCompleted(EVENT_PREFIX);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, skipped: true });
    expect(updateUserMetadataMock).not.toHaveBeenCalled();
  });

  it("処理中のイベントの再送は409を返し、Stripeに後で再送させる", async () => {
    const eventId = `${EVENT_PREFIX}_processing`;
    const { error } = await supabase.from("stripe_webhook_events").insert({
      event_id: eventId,
      type: "checkout.session.completed",
      payload: {},
      status: "processing",
    });
    if (error) throw error;

    const response = await postSubscriptionCompleted(eventId);
    expect(response.status).toBe(409);
    expect(await findEventStatus(eventId)).toBe("processing");
    expect(updateUserMetadataMock).not.toHaveBeenCalled();
  });

  it("同じサブスクリプションの別イベントが届いても、rank_changes・subscriptionsが2行にならない", async () => {
    const response = await postSubscriptionCompleted(`${EVENT_PREFIX}_retry`);
    expect(response.status).toBe(200);

    const { count: rankChangeCount } = await supabase
      .from("rank_changes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ONBOARDING_USER_ID);
    expect(rankChangeCount).toBe(1);

    const { count: subscriptionCount } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ONBOARDING_USER_ID);
    expect(subscriptionCount).toBe(1);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("入会済みの会員に別のサブスクリプションが届いたら、記録を変えずにSentryへerrorを送り、200を返す", async () => {
    const eventId = `${EVENT_PREFIX}_other_subscription`;
    const response = await postSubscriptionCompleted(eventId, {
      id: "cs_test_stripe_checkout_webhook_413_other",
      subscription: OTHER_SUBSCRIPTION_ID,
      metadata: { clerk_user_id: ONBOARDING_CLERK_ID, plan: "premium" },
    });
    expect(response.status).toBe(200);
    expect(await findEventStatus(eventId)).toBe("processed");

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][1]).toMatchObject({
      level: "error",
      extra: {
        clerkUserId: ONBOARDING_CLERK_ID,
        stripeCustomerId: ONBOARDING_CUSTOMER_ID,
        stripeSubscriptionId: OTHER_SUBSCRIPTION_ID,
      },
    });

    const { data: subscriptions } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", ONBOARDING_USER_ID);
    expect(subscriptions).toEqual([
      { stripe_subscription_id: ONBOARDING_SUBSCRIPTION_ID },
    ]);
    const { data: user } = await supabase
      .from("users")
      .select("rank_code")
      .eq("id", ONBOARDING_USER_ID)
      .single();
    expect(user?.rank_code).toBe("standard");
    expect(updateUserMetadataMock).not.toHaveBeenCalled();
  });
});
