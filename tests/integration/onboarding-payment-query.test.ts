import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（supabase-server-client.test.ts と同じ）
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signTestJwt(sub: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub,
    })
  );
  const signature = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${base64url(signature)}`;
}

const { getToken, listSubscriptionsMock } = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  listSubscriptionsMock: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({ getToken })),
}));

// Stripe API だけを差し替え、会員の Stripe Customer は実DBから読む
vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: { list: listSubscriptionsMock },
  }),
}));

import { onboardingPaymentQueryService } from "@/composition/onboarding-payment-query";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 決済は済んだが、入会の確定（Webhook）がまだの会員
const USER_ID = "00000000-0000-0000-0000-000000598a01";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000598b01";
const CLERK_USER = "clerk_test_onboarding_payment_query";
const CLERK_OTHER_USER = "clerk_test_onboarding_payment_query_other";
const STRIPE_CUSTOMER_ID = "cus_test_onboarding_payment_query";

async function cleanup() {
  await supabase.from("users").delete().in("id", [USER_ID, OTHER_USER_ID]);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await supabase.from("users").insert([
    {
      id: USER_ID,
      clerk_user_id: CLERK_USER,
      email: `${CLERK_USER}@example.com`,
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "basic",
      onboarding_completed: false,
      billing_anchor_day: 1,
      stripe_customer_id: STRIPE_CUSTOMER_ID,
    },
    {
      id: OTHER_USER_ID,
      clerk_user_id: CLERK_OTHER_USER,
      email: `${CLERK_OTHER_USER}@example.com`,
      first_name: "テスト",
      last_name: "次郎",
      rank_code: "basic",
      onboarding_completed: false,
      billing_anchor_day: 1,
    },
  ]);
  if (error) throw error;
});

afterAll(cleanup);

// 決済完了画面の組み立て。会員の Stripe Customer をログイン中の会員のトークンで RLS を効かせて読むこと
describe("onboardingPaymentQueryService（composition。RLS 付きのクライアント）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSubscriptionsMock.mockResolvedValue({ data: [{ status: "active" }] });
  });

  it("入会の確定前の会員のトークンで、自分の Stripe Customer の有効なサブスクリプションを確認できる", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_USER));
    const queryService = await onboardingPaymentQueryService();

    expect(
      await queryService.findPaymentCompleted({
        clerkUserId: CLERK_USER,
        sessionId: null,
      })
    ).toBe(true);
    expect(listSubscriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: STRIPE_CUSTOMER_ID })
    );
  });

  it("引数に他の会員を渡しても、RLS によりトークンの会員以外の Stripe Customer は読めない", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_OTHER_USER));
    const queryService = await onboardingPaymentQueryService();

    expect(
      await queryService.findPaymentCompleted({
        clerkUserId: CLERK_USER,
        sessionId: null,
      })
    ).toBe(false);
    expect(listSubscriptionsMock).not.toHaveBeenCalled();
  });
});
