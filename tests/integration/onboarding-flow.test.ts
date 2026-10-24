import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getStripe } from "@/lib/stripe";

/**
 * 入会の流れ（プラン選択 → 決済画面 → 決済完了画面 → 入会確定のWebhook → ショップ）を
 * 1本で通す統合テスト（GitHub issue #521）。段階ごとのテストは通るのに、つなぐと壊れる
 * 不具合（#461 等）をCIで検出するため、Stripe APIだけを下のFakeStripeに差し替え、
 * DB・ユースケース・Webhookのルート・決済完了画面は本物を使う。どの段階も、前の段階が
 * 返した値（リダイレクト先・Stripeに作らせたセッション・Webhookの応答）を次の段階に渡す
 */

// ログイン中の会員（Clerk）と、Clerkのmetadata更新（外部API）を差し替える
const clerk = vi.hoisted(() => ({
  currentUserId: null as string | null,
  publicMetadata: new Map<string, unknown>(),
  updateUserMetadata: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.currentUserId }),
  currentUser: async () => ({
    emailAddresses: [{ emailAddress: `${clerk.currentUserId}@example.com` }],
  }),
  clerkClient: async () => ({
    users: { updateUserMetadata: clerk.updateUserMetadata },
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  startSpan: vi.fn((_options: unknown, callback: () => unknown) => callback()),
}));

// Server Componentのredirectは例外で判定する（tests/unit/onboarding-payment-success.test.tsと同じ）
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

import * as Sentry from "@sentry/nextjs";
import { selectPlan } from "@/app/onboarding/plan/actions";
import OnboardingPaymentPage from "@/app/onboarding/payment/page";
import PaymentSuccessPage from "@/app/onboarding/payment/success/page";
import { POST } from "@/app/api/webhooks/stripe/route";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const CLERK_ID_PREFIX = "clerk_test_onboarding_flow";
const EVENT_ID_PREFIX = "evt_test_onboarding_flow";
const APP_URL = "http://localhost:3000";
const PROCESSING_TEXT = "アカウントの設定を処理中です";

type FakeCheckoutSession = {
  id: string;
  url: string;
  status: "open" | "complete";
  customer: string;
  subscription: string | null;
  success_url: string;
  metadata: Record<string, string>;
  subscriptionMetadata: Record<string, string>;
};

type FakeSubscription = {
  id: string;
  customer: string;
  status: "active";
  start_date: number;
  metadata: Record<string, string>;
  items: {
    data: { current_period_start: number; current_period_end: number }[];
  };
};

const toUnix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/**
 * 入会の流れが使うStripe APIの状態を持つ偽物。Customer・Checkout Sessionは
 * アプリが渡した引数から作り、決済（pay）でセッションを完了にしてサブスクリプションを作る。
 * 冪等キーが同じ呼び出しには、Stripeと同じく前回の結果を返す
 */
class FakeStripe {
  readonly customers = new Map<string, { id: string; email: string }>();
  readonly sessions = new Map<string, FakeCheckoutSession>();
  readonly subscriptions = new Map<string, FakeSubscription>();
  private readonly idempotentResults = new Map<string, unknown>();
  private seq = 0;

  private nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}${Date.now().toString(36)}${this.seq}`;
  }

  private idempotent<T>(key: string | undefined, create: () => T): T {
    if (key && this.idempotentResults.has(key)) {
      return this.idempotentResults.get(key) as T;
    }
    const result = create();
    if (key) this.idempotentResults.set(key, result);
    return result;
  }

  createCustomer(
    params: { email: string },
    options?: { idempotencyKey?: string }
  ) {
    return this.idempotent(options?.idempotencyKey, () => {
      const customer = { id: this.nextId("cus_testflow"), email: params.email };
      this.customers.set(customer.id, customer);
      return customer;
    });
  }

  createCheckoutSession(
    params: {
      customer: string;
      success_url: string;
      metadata: Record<string, string>;
      subscription_data: { metadata: Record<string, string> };
    },
    options?: { idempotencyKey?: string }
  ) {
    return this.idempotent(options?.idempotencyKey, () => {
      const id = this.nextId("cs_test_flow");
      const session: FakeCheckoutSession = {
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        status: "open",
        customer: params.customer,
        subscription: null,
        success_url: params.success_url,
        metadata: params.metadata,
        subscriptionMetadata: params.subscription_data.metadata,
      };
      this.sessions.set(id, session);
      return session;
    });
  }

  retrieveCheckoutSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) {
      throw Object.assign(new Error(`No such checkout.session: ${id}`), {
        type: "StripeInvalidRequestError",
        statusCode: 404,
      });
    }
    return session;
  }

  listSubscriptions(params: { customer: string }) {
    return {
      data: [...this.subscriptions.values()].filter(
        (s) => s.customer === params.customer
      ),
    };
  }

  retrieveSubscription(id: string) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) throw new Error(`No such subscription: ${id}`);
    return subscription;
  }

  /** Checkoutの画面で会員がカード決済を終えたときの状態にし、Stripeが戻すsuccess_urlを返す */
  pay(checkoutUrl: string): string {
    const session = [...this.sessions.values()].find(
      (s) => s.url === checkoutUrl
    );
    if (!session) throw new Error(`Checkoutの画面ではない: ${checkoutUrl}`);
    const subscription: FakeSubscription = {
      id: this.nextId("sub_testflow"),
      customer: session.customer,
      status: "active",
      // JST 2026-10-18 05:00（UTCでは10/17）
      start_date: toUnix("2026-10-17T20:00:00Z"),
      metadata: session.subscriptionMetadata,
      items: {
        data: [
          {
            current_period_start: toUnix("2026-10-18T00:00:00Z"),
            current_period_end: toUnix("2026-11-18T00:00:00Z"),
          },
        ],
      },
    };
    this.subscriptions.set(subscription.id, subscription);
    session.status = "complete";
    session.subscription = subscription.id;
    return session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id);
  }

  /** 完了したセッションについてStripeが送るcheckout.session.completedのイベント */
  checkoutCompletedEvent(sessionId: string) {
    const session = this.retrieveCheckoutSession(sessionId);
    return {
      id: `${EVENT_ID_PREFIX}_${session.id}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: session.id,
          object: "checkout.session",
          mode: "subscription",
          status: session.status,
          payment_status: "paid",
          customer: session.customer,
          subscription: session.subscription,
          metadata: session.metadata,
        },
      },
    };
  }
}

let stripe: FakeStripe;

function mockStripeApi() {
  const client = getStripe();
  vi.spyOn(client.customers, "create").mockImplementation((async (
    params: never,
    options: never
  ) => stripe.createCustomer(params, options)) as never);
  vi.spyOn(client.checkout.sessions, "create").mockImplementation((async (
    params: never,
    options: never
  ) => stripe.createCheckoutSession(params, options)) as never);
  vi.spyOn(client.checkout.sessions, "retrieve").mockImplementation((async (
    id: string
  ) => stripe.retrieveCheckoutSession(id)) as never);
  vi.spyOn(client.subscriptions, "list").mockImplementation((async (
    params: never
  ) => stripe.listSubscriptions(params)) as never);
  vi.spyOn(client.subscriptions, "retrieve").mockImplementation((async (
    id: string
  ) => stripe.retrieveSubscription(id)) as never);
}

type PageResult = { redirectTo: string } | { html: string };

/** 会員がブラウザでURLを開いたときの、アプリの画面の結果（リダイレクト先か描画内容） */
async function visit(url: string): Promise<PageResult> {
  const { pathname, searchParams } = new URL(url, APP_URL);
  let render: () => Promise<unknown>;
  if (pathname === "/onboarding/payment") {
    render = () => OnboardingPaymentPage();
  } else if (pathname === "/onboarding/payment/success") {
    render = () =>
      PaymentSuccessPage({
        searchParams: Promise.resolve(Object.fromEntries(searchParams)),
      });
  } else {
    throw new Error(`テストで扱わない画面: ${url}`);
  }

  try {
    return { html: renderToStaticMarkup((await render()) as ReactElement) };
  } catch (err) {
    const match = /^NEXT_REDIRECT:(.*)$/.exec((err as Error).message);
    if (!match) throw err;
    return { redirectTo: match[1] };
  }
}

function submitPlan(plan: string) {
  const formData = new FormData();
  formData.set("accountType", "individual");
  formData.set("plan", plan);
  formData.set("lastName", "入会");
  formData.set("firstName", "太郎");
  formData.set("phoneNumber", "09012345678");
  return selectPlan(null, formData);
}

function sendWebhook(event: object) {
  const payload = JSON.stringify(event);
  const signature = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return POST(
    new Request(`${APP_URL}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    })
  );
}

/**
 * プラン選択から、Checkoutで決済してStripeが決済完了画面へ戻すところまで進める。
 * 戻り値は決済完了画面のURL（Stripeがsuccess_urlにsession_idを入れたもの）
 */
async function selectPlanAndPay(plan: string): Promise<string> {
  const selected = await submitPlan(plan);
  expect(selected).toEqual({ redirectTo: "/onboarding/payment" });
  if (!("redirectTo" in selected)) throw new Error("unreachable");

  const payment = await visit(selected.redirectTo);
  if (!("redirectTo" in payment)) {
    throw new Error(`決済画面がCheckoutへ進まなかった: ${payment.html}`);
  }
  return stripe.pay(payment.redirectTo);
}

function sessionIdOf(successUrl: string): string {
  return new URL(successUrl).searchParams.get("session_id")!;
}

async function findMember(clerkUserId: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, rank_code, initial_fee_paid_rank_code, stripe_customer_id, billing_anchor_day, onboarding_completed"
    )
    .eq("clerk_user_id", clerkUserId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  const { id: userId, ...columns } = user;
  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status, rank_code")
    .eq("user_id", userId);
  const { data: rankChanges } = await supabase
    .from("rank_changes")
    .select(
      "from_rank_code, to_rank_code, changed_by, initial_fee_charged, stripe_subscription_id"
    )
    .eq("user_id", userId);
  return { user: columns, subscriptions, rankChanges };
}

/** 決済したセッションの内容で入会が確定したときのDBの状態 */
function confirmedMember(sessionId: string, rank: string) {
  const session = stripe.retrieveCheckoutSession(sessionId);
  return {
    user: {
      rank_code: rank,
      initial_fee_paid_rank_code: rank,
      stripe_customer_id: session.customer,
      // サブスクリプションの開始日時（start_date）のJSTの日付
      billing_anchor_day: 18,
      onboarding_completed: true,
    },
    subscriptions: [
      {
        stripe_subscription_id: session.subscription,
        status: "active",
        rank_code: rank,
      },
    ],
    rankChanges: [
      {
        from_rank_code: null,
        to_rank_code: rank,
        changed_by: "member",
        initial_fee_charged: true,
        stripe_subscription_id: session.subscription,
      },
    ],
  };
}

async function cleanup() {
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .like("clerk_user_id", `${CLERK_ID_PREFIX}%`);
  const userIds = users?.map((u) => u.id) ?? [];
  if (userIds.length > 0) {
    await supabase.from("rank_changes").delete().in("user_id", userIds);
    await supabase.from("subscriptions").delete().in("user_id", userIds);
    await supabase.from("users").delete().in("id", userIds);
  }
  await supabase
    .from("stripe_webhook_events")
    .delete()
    .like("event_id", `${EVENT_ID_PREFIX}%`);
}

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL);
  mockStripeApi();
  await cleanup();
});

afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await cleanup();
});

beforeEach(() => {
  stripe = new FakeStripe();
  vi.mocked(Sentry.captureException).mockClear();
  clerk.publicMetadata.clear();
  clerk.updateUserMetadata.mockReset();
  clerk.updateUserMetadata.mockImplementation(
    async (clerkUserId: string, params: { publicMetadata: unknown }) => {
      clerk.publicMetadata.set(clerkUserId, params.publicMetadata);
    }
  );
});

function signInAs(name: string) {
  clerk.currentUserId = `${CLERK_ID_PREFIX}_${name}`;
  return clerk.currentUserId;
}

describe("入会の流れ（プラン選択 → 決済 → Webhook → ショップ・実DB）", () => {
  it("プラン選択から決済・Webhookを経て、決済完了画面がショップへ進み、DBが入会済みになる", async () => {
    const clerkUserId = signInAs("happy");

    const selected = await submitPlan("standard");
    expect(selected).toEqual({ redirectTo: "/onboarding/payment" });
    if (!("redirectTo" in selected)) throw new Error("unreachable");

    // 決済画面: 会員のCustomerを作ってusersに保存し、そのCustomerでCheckoutを作る
    const payment = await visit(selected.redirectTo);
    expect(stripe.customers.size).toBe(1);
    expect(stripe.sessions.size).toBe(1);
    const [session] = stripe.sessions.values();
    expect(payment).toEqual({ redirectTo: session.url });
    expect(session.metadata).toEqual({
      clerk_user_id: clerkUserId,
      plan: "standard",
    });
    const beforePayment = await findMember(clerkUserId);
    expect(beforePayment.user).toMatchObject({
      rank_code: "standard",
      stripe_customer_id: session.customer,
      onboarding_completed: false,
    });

    // Checkoutで決済し、Stripeがsuccess_urlへ戻す
    if (!("redirectTo" in payment)) throw new Error("unreachable");
    const successUrl = stripe.pay(payment.redirectTo);

    // Webhookが届く前は「処理中」
    const beforeWebhook = await visit(successUrl);
    expect(beforeWebhook).toEqual({
      html: expect.stringContaining(PROCESSING_TEXT),
    });

    const response = await sendWebhook(
      stripe.checkoutCompletedEvent(sessionIdOf(successUrl))
    );
    expect(response.status).toBe(200);

    expect(await visit(successUrl)).toEqual({ redirectTo: "/shop" });
    expect(await findMember(clerkUserId)).toEqual(
      confirmedMember(session.id, "standard")
    );
    expect(clerk.publicMetadata.get(clerkUserId)).toEqual({
      onboarding_completed: true,
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("Webhookが遅れている間に決済画面を開き直しても、新しいCheckoutを作らず、決済完了画面で処理中を表示する", async () => {
    signInAs("webhook_delayed");
    await selectPlanAndPay("basic");
    expect(stripe.sessions.size).toBe(1);

    // 戻るボタン・ブックマーク等で決済画面を開き直す
    const reopened = await visit("/onboarding/payment");
    expect(reopened).toEqual({ redirectTo: "/onboarding/payment/success" });
    expect(stripe.sessions.size).toBe(1);
    expect(stripe.customers.size).toBe(1);

    // 決済画面が送る決済完了画面にはsession_idが無い（#461）
    if (!("redirectTo" in reopened)) throw new Error("unreachable");
    expect(await visit(reopened.redirectTo)).toEqual({
      html: expect.stringContaining(PROCESSING_TEXT),
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("入会の確定後にプラン選択を送っても、入会済みのまま変わらない", async () => {
    const clerkUserId = signInAs("resubmit_plan");
    const successUrl = await selectPlanAndPay("standard");
    const response = await sendWebhook(
      stripe.checkoutCompletedEvent(sessionIdOf(successUrl))
    );
    expect(response.status).toBe(200);
    const confirmed = await findMember(clerkUserId);
    expect(confirmed).toEqual(
      confirmedMember(sessionIdOf(successUrl), "standard")
    );

    // 別タブに残っていたプラン選択の画面から送信する
    const resubmitted = await submitPlan("premium");
    expect(resubmitted).toMatchObject({
      error: "既に入会手続きが完了しています",
    });

    expect(await findMember(clerkUserId)).toEqual(confirmed);
    expect(clerk.publicMetadata.get(clerkUserId)).toEqual({
      onboarding_completed: true,
    });
    expect(await visit(successUrl)).toEqual({ redirectTo: "/shop" });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("同じWebhookが再送されても、subscriptions・rank_changesは増えず、決済完了画面はショップへ進む", async () => {
    const clerkUserId = signInAs("webhook_redelivered");
    const successUrl = await selectPlanAndPay("pro");
    const event = stripe.checkoutCompletedEvent(sessionIdOf(successUrl));

    const first = await sendWebhook(event);
    expect(first.status).toBe(200);
    const redelivered = await sendWebhook(event);
    expect(redelivered.status).toBe(200);

    expect(await findMember(clerkUserId)).toEqual(
      confirmedMember(sessionIdOf(successUrl), "pro")
    );
    expect(await visit(successUrl)).toEqual({ redirectTo: "/shop" });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each([
    [
      "サブスクリプションの取得（Stripe API）",
      "stripe",
      () =>
        vi
          .mocked(getStripe().subscriptions.retrieve)
          .mockRejectedValueOnce(new Error("Stripe API error")),
    ],
    [
      "確定後のClerkのmetadata更新",
      "clerk",
      () =>
        clerk.updateUserMetadata.mockRejectedValueOnce(
          new Error("Clerk API error")
        ),
    ],
  ])(
    "Webhookの処理が%sで失敗しても、再送で入会が最後まで確定し、決済完了画面がショップへ進む",
    async (_step, key, failOnce) => {
      const clerkUserId = signInAs(`webhook_failed_${key}`);
      const successUrl = await selectPlanAndPay("advanced");
      const event = stripe.checkoutCompletedEvent(sessionIdOf(successUrl));

      failOnce();
      const failed = await sendWebhook(event);
      // 500を返してStripeに再送させる
      expect(failed.status).toBe(500);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);

      const retried = await sendWebhook(event);
      expect(retried.status).toBe(200);

      expect(await visit(successUrl)).toEqual({ redirectTo: "/shop" });
      expect(await findMember(clerkUserId)).toEqual(
        confirmedMember(sessionIdOf(successUrl), "advanced")
      );
      expect(clerk.publicMetadata.get(clerkUserId)).toEqual({
        onboarding_completed: true,
      });
    }
  );
});
