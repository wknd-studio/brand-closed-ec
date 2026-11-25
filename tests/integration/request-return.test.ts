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
import { SupabaseReturnRepository } from "@/infrastructure/supabase/supabase-return-repository";
import { SupabaseMemberOrderQueryService } from "@/infrastructure/supabase/supabase-member-order-query-service";
import { reconstituteReturnRequest } from "@/domain/entities/return-request";
import { randomOrderNumber } from "../helpers/order-number";

// 返品・返金の申請（#381）。申請の保存（リポジトリ実装）と、注文詳細画面のサーバーアクション経由で
// 他の会員の注文に申請できないことを、RLS 付きの会員のクライアントで確かめる

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// role クレームの無いトークンは、Clerk のセッショントークンと同じ形（CI の Clerk のインスタンスは
// role を付けない）。PostgREST は role クレームが無いと anon ロールで実行し、RLS は sub で絞る
function signTestJwt(
  sub: string,
  { withRole = true }: { withRole?: boolean } = {}
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      ...(withRole ? { role: "authenticated" } : {}),
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub,
    })
  );
  const signature = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${base64url(signature)}`;
}

const USER_A_ID = "00000000-0000-0000-0000-0000003810a1";
const USER_B_ID = "00000000-0000-0000-0000-0000003810b1";
const CLERK_A = "clerk_test_request_return_a";
const CLERK_B = "clerk_test_request_return_b";

// 会員Aの注文（支払い済みの Checkout の明細と、請求前の後払いの明細）・
// 会員Aの支払い前の注文（パターン①）・会員Bの注文
const ORDER_A_ID = "00000000-0000-0000-0000-000000381001";
const ORDER_A_UNPAID_ID = "00000000-0000-0000-0000-000000381002";
const ORDER_B_ID = "00000000-0000-0000-0000-000000381003";
const ALL_ORDER_IDS = [ORDER_A_ID, ORDER_A_UNPAID_ID, ORDER_B_ID];
const SETTLEMENT_A_ID = "00000000-0000-0000-0000-000000381011";
const SETTLEMENT_A_UNPAID_ID = "00000000-0000-0000-0000-000000381012";
const SETTLEMENT_B_ID = "00000000-0000-0000-0000-000000381013";
const ITEM_A_PAID_ID = "00000000-0000-0000-0000-000000381101";
const ITEM_A_AFTER_ORDER_ID = "00000000-0000-0000-0000-000000381102";
const ITEM_A_UNPAID_ID = "00000000-0000-0000-0000-000000381103";
const ITEM_B_ID = "00000000-0000-0000-0000-000000381104";

// ログイン中の会員は常に会員A。Clerk のセッショントークンの代わりに、ローカルのJWTシークレットで
// 署名した sub = Clerk ID のトークンを返す。Clerk のトークンと同じく role クレームを付けない
vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({
    userId: CLERK_A,
    getToken: async () => signTestJwt(CLERK_A, { withRole: false }),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { requestReturnAction } from "@/app/(member)/orders/[id]/actions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function clientAs(clerkUserId: string, options?: { withRole?: boolean }) {
  return createClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${signTestJwt(clerkUserId, options)}`,
        },
      },
    }
  );
}

// トークンの無いクライアント（ログインしていない）
const anonClient = createClient<Database>(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);

// 申請はリポジトリで注文を集約として読むため、住所のスナップショットにも値を入れる
const addressSnapshot = {
  recipientLastName: "テスト",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

const baseOrder = {
  shipping_address_snapshot: addressSnapshot,
  billing_address_snapshot: addressSnapshot,
  rank_at_order: "basic" as const,
  monthly_limit_at_order: 1_000_000,
  status: "processing",
};

const baseItem = {
  sanity_product_id: "prod-381",
  product_name_snapshot: "テスト商品",
  unit_price_snapshot: 10_000,
  quantity: 3,
  is_negotiable: false,
};

async function cleanupReturns() {
  // return_items は申請の削除と一緒に消える（ON DELETE CASCADE）
  const { error } = await adminClient
    .from("returns")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  if (error) throw error;
}

async function cleanup() {
  await cleanupReturns();
  await adminClient.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await adminClient
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await adminClient.from("orders").delete().in("id", ALL_ORDER_IDS);
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
}

async function returnsOf(orderId: string) {
  const { data, error } = await adminClient
    .from("returns")
    .select(
      "order_id, status, requested_by_user_id, reason, return_items(order_item_id, quantity)"
    )
    .eq("order_id", orderId);
  if (error) throw error;
  return data;
}

function returnForm(
  quantities: Record<string, string>,
  reason: { kind: string; detail: string } = {
    kind: "defective",
    detail: "割れていた",
  }
): FormData {
  const formData = new FormData();
  formData.set("reason_kind", reason.kind);
  formData.set("reason_detail", reason.detail);
  for (const [orderItemId, quantity] of Object.entries(quantities)) {
    formData.set(`quantity:${orderItemId}`, quantity);
  }
  return formData;
}

beforeAll(async () => {
  await cleanup();
  for (const [id, clerkId] of [
    [USER_A_ID, CLERK_A],
    [USER_B_ID, CLERK_B],
  ]) {
    const { error } = await adminClient.from("users").insert({
      id,
      clerk_user_id: clerkId,
      email: `${clerkId}@example.com`,
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 10,
    });
    if (error) throw error;
  }
  const { error: ordersError } = await adminClient.from("orders").insert([
    {
      ...baseOrder,
      id: ORDER_A_ID,
      user_id: USER_A_ID,
      order_number: randomOrderNumber(),
    },
    {
      ...baseOrder,
      id: ORDER_A_UNPAID_ID,
      user_id: USER_A_ID,
      order_number: randomOrderNumber(),
    },
    {
      ...baseOrder,
      id: ORDER_B_ID,
      user_id: USER_B_ID,
      status: "paid",
      order_number: randomOrderNumber(),
    },
  ]);
  if (ordersError) throw ordersError;
  const { error: settlementsError } = await adminClient
    .from("order_settlements")
    .insert([
      {
        id: SETTLEMENT_A_ID,
        order_id: ORDER_A_ID,
        flow: "checkout",
        status: "paid",
        amount_snapshot: 30_000,
        stripe_checkout_session_id: "cs_test_request_return_a",
        paid_at: new Date().toISOString(),
      },
      {
        id: SETTLEMENT_A_UNPAID_ID,
        order_id: ORDER_A_UNPAID_ID,
        flow: "checkout",
        status: "pending_payment",
        amount_snapshot: 30_000,
        stripe_checkout_session_id: "cs_test_request_return_a_unpaid",
      },
      {
        id: SETTLEMENT_B_ID,
        order_id: ORDER_B_ID,
        flow: "checkout",
        status: "paid",
        amount_snapshot: 30_000,
        stripe_checkout_session_id: "cs_test_request_return_b",
        paid_at: new Date().toISOString(),
      },
    ]);
  if (settlementsError) throw settlementsError;
  const { error: itemsError } = await adminClient.from("order_items").insert([
    {
      ...baseItem,
      id: ITEM_A_PAID_ID,
      order_id: ORDER_A_ID,
      payment_timing: "at_order",
      settlement_id: SETTLEMENT_A_ID,
    },
    {
      ...baseItem,
      id: ITEM_A_AFTER_ORDER_ID,
      order_id: ORDER_A_ID,
      payment_timing: "after_order",
    },
    {
      ...baseItem,
      id: ITEM_A_UNPAID_ID,
      order_id: ORDER_A_UNPAID_ID,
      payment_timing: "at_order",
      settlement_id: SETTLEMENT_A_UNPAID_ID,
    },
    {
      ...baseItem,
      id: ITEM_B_ID,
      order_id: ORDER_B_ID,
      payment_timing: "at_order",
      settlement_id: SETTLEMENT_B_ID,
    },
  ]);
  if (itemsError) throw itemsError;
});

beforeEach(cleanupReturns);

afterAll(cleanup);

describe("SupabaseReturnRepository（会員Aのクライアント）", () => {
  const repo = new SupabaseReturnRepository(clientAs(CLERK_A));

  it("申請と明細を保存し、注文の申請として状態・理由・明細ごとの数量を読み戻せる", async () => {
    const returnId = crypto.randomUUID();
    await repo.save(
      reconstituteReturnRequest({
        id: returnId,
        orderId: ORDER_A_ID,
        status: "requested",
        requestedByUserId: USER_A_ID,
        reason: "不良品: 割れていた",
        items: [
          { orderItemId: ITEM_A_PAID_ID, quantity: 2 },
          { orderItemId: ITEM_A_AFTER_ORDER_ID, quantity: 1 },
        ],
      })
    );

    const found = await repo.findByOrderId(ORDER_A_ID);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: returnId,
      orderId: ORDER_A_ID,
      status: "requested",
      requestedByUserId: USER_A_ID,
      reason: "不良品: 割れていた",
    });
    expect(
      [...found[0]!.items].sort((a, b) =>
        a.orderItemId.localeCompare(b.orderItemId)
      )
    ).toEqual([
      { orderItemId: ITEM_A_PAID_ID, quantity: 2 },
      { orderItemId: ITEM_A_AFTER_ORDER_ID, quantity: 1 },
    ]);
  });

  it("他の会員の注文の申請は、RLS により読めない", async () => {
    const { error } = await adminClient.from("returns").insert({
      order_id: ORDER_B_ID,
      status: "requested",
      requested_by_user_id: USER_B_ID,
      reason: "不良品",
    });
    if (error) throw error;

    expect(await repo.findByOrderId(ORDER_B_ID)).toEqual([]);
  });

  it("他の会員の注文への申請は、RLS により保存できず例外を投げる", async () => {
    await expect(
      repo.save(
        reconstituteReturnRequest({
          id: crypto.randomUUID(),
          orderId: ORDER_B_ID,
          status: "requested",
          requestedByUserId: USER_A_ID,
          reason: "不良品",
          items: [{ orderItemId: ITEM_B_ID, quantity: 1 }],
        })
      )
    ).rejects.toThrow();
    expect(await returnsOf(ORDER_B_ID)).toEqual([]);
  });
});

describe("requestReturnAction（会員Aとしてログイン中）", () => {
  it("本人の注文の明細・数量・理由で申請すると、申請中の申請と明細が作られる", async () => {
    const result = await requestReturnAction(
      ORDER_A_ID,
      returnForm({ [ITEM_A_PAID_ID]: "2", [ITEM_A_AFTER_ORDER_ID]: "0" })
    );

    expect(result).toEqual({ success: true });
    expect(await returnsOf(ORDER_A_ID)).toEqual([
      {
        order_id: ORDER_A_ID,
        status: "requested",
        requested_by_user_id: USER_A_ID,
        reason: "不良品: 割れていた",
        return_items: [{ order_item_id: ITEM_A_PAID_ID, quantity: 2 }],
      },
    ]);
  });

  it("他の会員（B）の注文への申請はエラーを返し、申請は作られない", async () => {
    const result = await requestReturnAction(
      ORDER_B_ID,
      returnForm({ [ITEM_B_ID]: "1" })
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await returnsOf(ORDER_B_ID)).toEqual([]);
  });

  it("自分の注文に他の会員の注文の明細を指す申請はエラーを返し、申請は作られない", async () => {
    const result = await requestReturnAction(
      ORDER_A_ID,
      returnForm({ [ITEM_B_ID]: "1" })
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await returnsOf(ORDER_A_ID)).toEqual([]);
  });

  it("支払い完了前の注文の明細（パターン①）への申請はエラーを返し、申請は作られない", async () => {
    const result = await requestReturnAction(
      ORDER_A_UNPAID_ID,
      returnForm({ [ITEM_A_UNPAID_ID]: "1" })
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await returnsOf(ORDER_A_UNPAID_ID)).toEqual([]);
  });

  it("既存の申請と合わせて注文数量を超える申請はエラーを返し、2件目は作られない", async () => {
    expect(
      await requestReturnAction(
        ORDER_A_ID,
        returnForm({ [ITEM_A_PAID_ID]: "2" })
      )
    ).toEqual({ success: true });

    const result = await requestReturnAction(
      ORDER_A_ID,
      returnForm({ [ITEM_A_PAID_ID]: "2" })
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await returnsOf(ORDER_A_ID)).toHaveLength(1);
  });

  it("明細を1つも選ばない・理由が空の申請はエラーを返す", async () => {
    expect(
      await requestReturnAction(
        ORDER_A_ID,
        returnForm({ [ITEM_A_PAID_ID]: "0" })
      )
    ).toEqual({ error: expect.any(String) });
    expect(
      await requestReturnAction(
        ORDER_A_ID,
        returnForm({ [ITEM_A_PAID_ID]: "1" }, { kind: "other", detail: "" })
      )
    ).toEqual({ error: expect.any(String) });
    expect(await returnsOf(ORDER_A_ID)).toEqual([]);
  });

  it("UUID の形でない注文ID（改ざん等）はエラーを返す", async () => {
    expect(
      await requestReturnAction("not-a-uuid", returnForm({ x: "1" }))
    ).toEqual({ error: expect.any(String) });
  });
});

// Clerk のセッショントークンには role クレームが無く、PostgREST は anon ロールで実行する。
// 返品の表だけ authenticated にしか権限が無いと、注文詳細・申請が 42501（permission denied）になる（PR #779 の E2E）
describe("role クレームの無いトークン（Clerk のセッショントークンと同じ形）", () => {
  const clerkLikeClient = clientAs(CLERK_A, { withRole: false });
  const repo = new SupabaseReturnRepository(clerkLikeClient);

  it("注文詳細（申請できる明細を含む）を取得できる", async () => {
    const detail = await new SupabaseMemberOrderQueryService(
      clerkLikeClient
    ).findOrderDetail({ clerkUserId: CLERK_A, orderId: ORDER_A_ID });

    expect(detail?.returnableItems.map((i) => i.id).sort()).toEqual(
      [ITEM_A_PAID_ID, ITEM_A_AFTER_ORDER_ID].sort()
    );
  });

  it("本人の注文への申請を保存し、読み戻せる", async () => {
    const returnId = crypto.randomUUID();
    await repo.save(
      reconstituteReturnRequest({
        id: returnId,
        orderId: ORDER_A_ID,
        status: "requested",
        requestedByUserId: USER_A_ID,
        reason: "不良品",
        items: [{ orderItemId: ITEM_A_PAID_ID, quantity: 1 }],
      })
    );

    expect((await repo.findByOrderId(ORDER_A_ID)).map((r) => r.id)).toEqual([
      returnId,
    ]);
  });

  it("他の会員の注文の申請は読めず、他の会員の注文へは保存できない", async () => {
    const { error } = await adminClient.from("returns").insert({
      order_id: ORDER_B_ID,
      status: "requested",
      requested_by_user_id: USER_B_ID,
      reason: "不良品",
    });
    if (error) throw error;

    expect(await repo.findByOrderId(ORDER_B_ID)).toHaveLength(0);
    await expect(
      repo.save(
        reconstituteReturnRequest({
          id: crypto.randomUUID(),
          orderId: ORDER_B_ID,
          status: "requested",
          requestedByUserId: USER_A_ID,
          reason: "不良品",
          items: [{ orderItemId: ITEM_B_ID, quantity: 1 }],
        })
      )
    ).rejects.toThrow();
    expect(await returnsOf(ORDER_B_ID)).toHaveLength(1);
  });

  it("運営の内部情報（admin_note）は読めない", async () => {
    const { error } = await clerkLikeClient
      .from("returns")
      .select("admin_note")
      .eq("order_id", ORDER_A_ID);

    expect(error?.code).toBe("42501");
  });

  it("トークンの無いクライアントは、申請を読めず保存もできない", async () => {
    await requestReturnAction(
      ORDER_A_ID,
      returnForm({ [ITEM_A_PAID_ID]: "1" })
    );
    const anonRepo = new SupabaseReturnRepository(anonClient);

    expect(await anonRepo.findByOrderId(ORDER_A_ID)).toEqual([]);
    await expect(
      anonRepo.save(
        reconstituteReturnRequest({
          id: crypto.randomUUID(),
          orderId: ORDER_A_ID,
          status: "requested",
          requestedByUserId: USER_A_ID,
          reason: "不良品",
          items: [{ orderItemId: ITEM_A_PAID_ID, quantity: 1 }],
        })
      )
    ).rejects.toThrow();
    expect(await returnsOf(ORDER_A_ID)).toHaveLength(1);
  });
});
