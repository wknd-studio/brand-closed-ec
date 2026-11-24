import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getStripe } from "@/infrastructure/stripe/client";
import { POST } from "@/app/api/webhooks/stripe/route";

// GitHub issue #377: customer.subscription.updated / deleted で subscriptions を同期する

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000377";
const TEST_CLERK_ID = "clerk_test_stripe_subscription_webhook";
const TEST_SUBSCRIPTION_ID = "sub_test_stripe_subscription_webhook_377";
const UNKNOWN_SUBSCRIPTION_ID = "sub_test_stripe_subscription_webhook_unknown";
const EVENT_IDS = {
  pastDue: "evt_test_subscription_webhook_past_due",
  pastDueStale: "evt_test_subscription_webhook_past_due_stale",
  deleted: "evt_test_subscription_webhook_deleted",
  unknown: "evt_test_subscription_webhook_unknown",
  badSignature: "evt_test_subscription_webhook_bad_signature",
};

const toUnix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

// Stripe から取り直す最新の Subscription（テストごとに差し替える）
let latestSubscription: Record<string, unknown>;

function stripeSubscription(overrides: Record<string, unknown>) {
  return {
    id: TEST_SUBSCRIPTION_ID,
    object: "subscription",
    status: "active",
    start_date: toUnix("2026-10-01T00:00:00Z"),
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: {
      data: [
        {
          current_period_start: toUnix("2026-10-01T00:00:00Z"),
          current_period_end: toUnix("2026-11-01T00:00:00Z"),
        },
      ],
    },
    ...overrides,
  };
}

async function cleanup() {
  await supabase.from("subscriptions").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  await supabase
    .from("stripe_webhook_events")
    .delete()
    .in("event_id", Object.values(EVENT_IDS));
}

function signedRequest(
  eventId: string,
  type: string,
  object: Record<string, unknown>,
  secret = process.env.STRIPE_WEBHOOK_SECRET!
) {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type,
    data: { object },
  });
  const signature = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new Request("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

async function findSubscription() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "status, rank_code, current_period_start, current_period_end, cancel_at_period_end, canceled_at"
    )
    .eq("stripe_subscription_id", TEST_SUBSCRIPTION_ID)
    .single();
  if (error) throw error;
  return data;
}

async function findEventStatus(eventId: string) {
  const { data } = await supabase
    .from("stripe_webhook_events")
    .select("status")
    .eq("event_id", eventId)
    .maybeSingle();
  return data?.status ?? null;
}

beforeAll(async () => {
  await cleanup();
  const { error: userError } = await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "stripe-subscription-webhook-test@example.com",
    first_name: "テスト",
    last_name: "三郎",
    rank_code: "standard",
    onboarding_completed: true,
    billing_anchor_day: 1,
  });
  if (userError) throw userError;
  const { error } = await supabase.from("subscriptions").insert({
    user_id: TEST_USER_ID,
    stripe_customer_id: "cus_test_stripe_subscription_webhook",
    stripe_subscription_id: TEST_SUBSCRIPTION_ID,
    status: "active",
    rank_code: "standard",
    current_period_start: "2026-10-01T00:00:00Z",
    current_period_end: "2026-11-01T00:00:00Z",
  });
  if (error) throw error;

  // Stripe APIへの問い合わせ（Subscriptionの取得）だけを差し替える
  vi.spyOn(getStripe().subscriptions, "retrieve").mockImplementation(
    async () => latestSubscription as never
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

describe("Stripeサブスクリプション状態同期Webhook（実DB・署名検証込み）", () => {
  it("署名が不正なら400を返し、subscriptionsを変えない", async () => {
    latestSubscription = stripeSubscription({ status: "past_due" });

    const response = await POST(
      signedRequest(
        EVENT_IDS.badSignature,
        "customer.subscription.updated",
        latestSubscription,
        "whsec_wrong_secret"
      )
    );

    expect(response.status).toBe(400);
    expect((await findSubscription()).status).toBe("active");
    expect(await findEventStatus(EVENT_IDS.badSignature)).toBeNull();
  });

  it("customer.subscription.updated（past_due）を受けると、状態・請求期間・期末解約の予約が更新され、ランクは変わらない", async () => {
    // 価格が変わったイベントでもランクは書き換えない（#209 で扱う）
    latestSubscription = stripeSubscription({
      status: "past_due",
      cancel_at_period_end: true,
      items: {
        data: [
          {
            current_period_start: toUnix("2026-11-01T00:00:00Z"),
            current_period_end: toUnix("2026-12-01T00:00:00Z"),
            price: { id: "price_other_rank" },
          },
        ],
      },
    });

    const response = await POST(
      signedRequest(
        EVENT_IDS.pastDue,
        "customer.subscription.updated",
        latestSubscription
      )
    );

    expect(response.status).toBe(200);
    const row = await findSubscription();
    expect(row.status).toBe("past_due");
    expect(new Date(row.current_period_start).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z"
    );
    expect(new Date(row.current_period_end).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z"
    );
    expect(row.cancel_at_period_end).toBe(true);
    expect(row.canceled_at).toBeNull();
    expect(row.rank_code).toBe("standard");
    expect(await findEventStatus(EVENT_IDS.pastDue)).toBe("processed");
  });

  it("customer.subscription.deleted を受けると、canceled と解約日時が記録される", async () => {
    latestSubscription = stripeSubscription({
      status: "canceled",
      canceled_at: toUnix("2026-11-10T00:00:00Z"),
      ended_at: toUnix("2026-11-15T00:00:00Z"),
    });

    const response = await POST(
      signedRequest(
        EVENT_IDS.deleted,
        "customer.subscription.deleted",
        latestSubscription
      )
    );

    expect(response.status).toBe(200);
    const row = await findSubscription();
    expect(row.status).toBe("canceled");
    expect(new Date(row.canceled_at!).toISOString()).toBe(
      "2026-11-15T00:00:00.000Z"
    );
  });

  it("解約の後に遅れて届いた古い updated（past_due）でも、Stripeの最新の状態で更新するため canceled のまま", async () => {
    // latestSubscription は直前のテストの canceled のまま
    const response = await POST(
      signedRequest(
        EVENT_IDS.pastDueStale,
        "customer.subscription.updated",
        stripeSubscription({ status: "past_due" })
      )
    );

    expect(response.status).toBe(200);
    expect((await findSubscription()).status).toBe("canceled");
  });

  it("同じイベントの再配信はスキップされる", async () => {
    const response = await POST(
      signedRequest(
        EVENT_IDS.pastDue,
        "customer.subscription.updated",
        stripeSubscription({ status: "past_due" })
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, skipped: true });
    expect((await findSubscription()).status).toBe("canceled");
  });

  it("対応するsubscriptionsの行が無いサブスクリプションは、200を返してイベントを処理済みにする（Stripeに再送させない）", async () => {
    latestSubscription = stripeSubscription({
      id: UNKNOWN_SUBSCRIPTION_ID,
      status: "past_due",
    });

    const response = await POST(
      signedRequest(
        EVENT_IDS.unknown,
        "customer.subscription.updated",
        latestSubscription
      )
    );

    expect(response.status).toBe(200);
    expect(await findEventStatus(EVENT_IDS.unknown)).toBe("processed");
    const { count } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("stripe_subscription_id", UNKNOWN_SUBSCRIPTION_ID);
    expect(count).toBe(0);
  });
});
