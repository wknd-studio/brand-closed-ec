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
import type { Database } from "@/types/database.types";
import { SupabaseReturnRepository } from "@/infrastructure/supabase/supabase-return-repository";
import { SupabaseAdminReturnQueryService } from "@/infrastructure/supabase/supabase-admin-return-query-service";
import { OrderNumber } from "@/domain/value-objects/order-number";
import { randomOrderNumber } from "../helpers/order-number";

// 運営者の返品申請の確認（#383）。一覧・詳細の読み取り（Query Service）、承認・却下の条件付き更新
// （リポジトリ）、管理画面のサーバーアクションの認可を、実DBで確かめる

const ADMIN_CLERK_USER_ID = "clerk_test_admin_returns";

// ログイン中の利用者。テストごとに運営者・会員・ログインしていない人を切り替える
const { requireAuthMock } = vi.hoisted(() => ({ requireAuthMock: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireAuth: requireAuthMock }));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  approveReturnAction,
  rejectReturnAction,
  updateReturnAdminNoteAction,
} from "@/app/admin/returns/[id]/actions";

const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-0000003830a1";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000003830f1";
const ORDER_ID = "00000000-0000-0000-0000-000000383001";
const ORDER_NUMBER = randomOrderNumber();
const SETTLEMENT_ID = "00000000-0000-0000-0000-000000383011";
const ITEM_PAID_ID = "00000000-0000-0000-0000-000000383101";
const ITEM_AFTER_ORDER_ID = "00000000-0000-0000-0000-000000383102";

// 1回目の送信（支払いのまとまりごとに2件に分けた申請）・2回目の送信・運営者が作った申請
const FIRST_PAID_RETURN_ID = "00000000-0000-0000-0000-000000383201";
const FIRST_AFTER_ORDER_RETURN_ID = "00000000-0000-0000-0000-000000383202";
const SECOND_RETURN_ID = "00000000-0000-0000-0000-000000383203";
const ADMIN_CREATED_RETURN_ID = "00000000-0000-0000-0000-000000383204";
const FIRST_SUBMITTED_AT = "2026-11-20T01:00:00.123456+00:00";
const SECOND_SUBMITTED_AT = "2026-11-21T01:00:00+00:00";
const ADMIN_CREATED_AT = "2026-11-19T01:00:00+00:00";
const APPROVED_AT = "2026-11-21T02:00:00+00:00";

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

const baseItem = {
  order_id: ORDER_ID,
  sanity_product_id: "prod-383",
  unit_price_snapshot: 10_000,
  quantity: 3,
  is_negotiable: false,
};

function asAdmin() {
  requireAuthMock.mockResolvedValue({
    userId: ADMIN_CLERK_USER_ID,
    sessionClaims: { metadata: { role: "admin" } },
  });
}

async function cleanupReturns() {
  // return_items は申請の削除と一緒に消える（ON DELETE CASCADE）
  const { error } = await adminClient
    .from("returns")
    .delete()
    .eq("order_id", ORDER_ID);
  if (error) throw error;
}

async function cleanup() {
  await cleanupReturns();
  await adminClient.from("order_items").delete().eq("order_id", ORDER_ID);
  await adminClient.from("order_settlements").delete().eq("order_id", ORDER_ID);
  await adminClient.from("orders").delete().eq("id", ORDER_ID);
  await adminClient.from("users").delete().eq("id", USER_ID);
  await adminClient.from("admin_users").delete().eq("id", ADMIN_USER_ID);
}

async function insertReturns() {
  const { error } = await adminClient.from("returns").insert([
    {
      id: FIRST_PAID_RETURN_ID,
      order_id: ORDER_ID,
      status: "requested",
      requested_by_user_id: USER_ID,
      reason: "不良品: 割れていた",
      created_at: FIRST_SUBMITTED_AT,
    },
    {
      id: FIRST_AFTER_ORDER_RETURN_ID,
      order_id: ORDER_ID,
      status: "requested",
      requested_by_user_id: USER_ID,
      reason: "不良品: 割れていた",
      created_at: FIRST_SUBMITTED_AT,
    },
    {
      id: SECOND_RETURN_ID,
      order_id: ORDER_ID,
      status: "approved",
      requested_by_user_id: USER_ID,
      reviewed_by_admin_user_id: ADMIN_USER_ID,
      reason: "誤配送: 色違い",
      admin_note: "着払いで返送を依頼",
      approved_at: APPROVED_AT,
      created_at: SECOND_SUBMITTED_AT,
    },
    {
      id: ADMIN_CREATED_RETURN_ID,
      order_id: ORDER_ID,
      status: "cancelled",
      created_by_admin_user_id: ADMIN_USER_ID,
      reason: "回収不能（未払い放置）",
      created_at: ADMIN_CREATED_AT,
    },
  ]);
  if (error) throw error;
  const { error: itemsError } = await adminClient.from("return_items").insert([
    {
      return_id: FIRST_PAID_RETURN_ID,
      order_item_id: ITEM_PAID_ID,
      quantity: 2,
    },
    {
      return_id: FIRST_AFTER_ORDER_RETURN_ID,
      order_item_id: ITEM_AFTER_ORDER_ID,
      quantity: 1,
    },
    { return_id: SECOND_RETURN_ID, order_item_id: ITEM_PAID_ID, quantity: 1 },
    {
      return_id: ADMIN_CREATED_RETURN_ID,
      order_item_id: ITEM_AFTER_ORDER_ID,
      quantity: 3,
    },
  ]);
  if (itemsError) throw itemsError;
}

async function returnRow(id: string) {
  const { data, error } = await adminClient
    .from("returns")
    .select("status, reviewed_by_admin_user_id, admin_note, approved_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await cleanup();
  for (const insert of [
    () =>
      adminClient.from("users").insert({
        id: USER_ID,
        clerk_user_id: "clerk_test_admin_returns_member",
        email: "admin-returns-member@example.com",
        first_name: "太郎",
        last_name: "返品",
        rank_code: "basic",
        onboarding_completed: true,
        billing_anchor_day: 10,
      }),
    () =>
      adminClient.from("admin_users").insert({
        id: ADMIN_USER_ID,
        clerk_user_id: ADMIN_CLERK_USER_ID,
        name: "運営 花子",
        email: "admin-returns@example.com",
      }),
    () =>
      adminClient.from("orders").insert({
        id: ORDER_ID,
        order_number: ORDER_NUMBER,
        user_id: USER_ID,
        status: "processing",
        shipping_address_snapshot: addressSnapshot,
        billing_address_snapshot: addressSnapshot,
        rank_at_order: "basic",
        monthly_limit_at_order: 1_000_000,
      }),
    () =>
      adminClient.from("order_settlements").insert({
        id: SETTLEMENT_ID,
        order_id: ORDER_ID,
        flow: "checkout",
        status: "paid",
        amount_snapshot: 30_000,
        stripe_checkout_session_id: "cs_test_admin_returns",
        paid_at: new Date().toISOString(),
      }),
    () =>
      adminClient.from("order_items").insert([
        {
          ...baseItem,
          id: ITEM_PAID_ID,
          product_name_snapshot: "先払いの商品",
          payment_timing: "at_order",
          settlement_id: SETTLEMENT_ID,
        },
        {
          ...baseItem,
          id: ITEM_AFTER_ORDER_ID,
          product_name_snapshot: "後払いの商品",
          payment_timing: "after_order",
        },
      ]),
  ]) {
    const { error } = await insert();
    if (error) throw error;
  }
});

beforeEach(async () => {
  await cleanupReturns();
  await insertReturns();
  requireAuthMock.mockReset();
});

afterAll(cleanup);

describe("SupabaseAdminReturnQueryService（service role）", () => {
  const queryService = new SupabaseAdminReturnQueryService(adminClient);

  // 他のテストの申請も一覧に出るため、この注文のまとまりだけを見る
  async function submissionsOfOrder(
    status: Parameters<typeof queryService.findSubmissions>[0]["status"]
  ) {
    return (await queryService.findSubmissions({ status })).filter(
      (s) => s.orderId === ORDER_ID
    );
  }

  it("同じ注文・同じ作成日時の申請を1つのまとまりにし、新しい送信から順に並べる", async () => {
    const submissions = await submissionsOfOrder(null);

    expect(
      submissions.map((s) => ({
        createdAt: new Date(s.createdAt).toISOString(),
        returnIds: s.returns.map((r) => r.id).sort(),
      }))
    ).toEqual([
      {
        createdAt: new Date(SECOND_SUBMITTED_AT).toISOString(),
        returnIds: [SECOND_RETURN_ID],
      },
      {
        createdAt: new Date(FIRST_SUBMITTED_AT).toISOString(),
        returnIds: [FIRST_PAID_RETURN_ID, FIRST_AFTER_ORDER_RETURN_ID].sort(),
      },
      {
        createdAt: new Date(ADMIN_CREATED_AT).toISOString(),
        returnIds: [ADMIN_CREATED_RETURN_ID],
      },
    ]);
  });

  it("まとまりは注文番号・申請者を持ち、申請ごとに状態と明細（商品名・返品数量・注文数量）を持つ。運営者が作った申請は申請者が無い", async () => {
    const [second, first, adminCreated] = await submissionsOfOrder(null);

    expect(first).toMatchObject({
      orderId: ORDER_ID,
      orderNumber: OrderNumber.of(ORDER_NUMBER).display(),
      requesterName: "返品 太郎",
    });
    expect(first!.returns.find((r) => r.id === FIRST_PAID_RETURN_ID)).toEqual({
      id: FIRST_PAID_RETURN_ID,
      status: "requested",
      items: [
        {
          orderItemId: ITEM_PAID_ID,
          productName: "先払いの商品",
          quantity: 2,
          orderedQuantity: 3,
        },
      ],
    });
    expect(second!.returns[0]!.status).toBe("approved");
    expect(adminCreated!.requesterName).toBeNull();
  });

  it("状態で絞り込むと、その状態の申請だけを返す", async () => {
    const requested = await submissionsOfOrder("requested");
    expect(requested.flatMap((s) => s.returns.map((r) => r.id)).sort()).toEqual(
      [FIRST_PAID_RETURN_ID, FIRST_AFTER_ORDER_RETURN_ID].sort()
    );

    const approved = await submissionsOfOrder("approved");
    expect(approved.flatMap((s) => s.returns.map((r) => r.id))).toEqual([
      SECOND_RETURN_ID,
    ]);
  });

  it("詳細は、注文・明細・数量・理由・申請者・状態・運営メモ・確認した運営者・承認日時を返す", async () => {
    const detail = await queryService.findDetail(SECOND_RETURN_ID);

    expect(detail).toEqual({
      id: SECOND_RETURN_ID,
      status: "approved",
      orderId: ORDER_ID,
      orderNumber: OrderNumber.of(ORDER_NUMBER).display(),
      createdAt: expect.any(String),
      reason: "誤配送: 色違い",
      adminNote: "着払いで返送を依頼",
      requester: {
        name: "返品 太郎",
        email: "admin-returns-member@example.com",
      },
      createdByAdminName: null,
      reviewedByAdminName: "運営 花子",
      approvedAt: expect.any(String),
      items: [
        {
          orderItemId: ITEM_PAID_ID,
          productName: "先払いの商品",
          quantity: 1,
          orderedQuantity: 3,
        },
      ],
      siblings: [],
    });
    expect(new Date(detail!.approvedAt!).toISOString()).toBe(
      new Date(APPROVED_AT).toISOString()
    );
  });

  it("詳細は、同じ送信で作られたほかの申請を siblings に持つ", async () => {
    const detail = await queryService.findDetail(FIRST_PAID_RETURN_ID);

    expect(detail?.siblings).toEqual([
      {
        id: FIRST_AFTER_ORDER_RETURN_ID,
        status: "requested",
        items: [
          {
            orderItemId: ITEM_AFTER_ORDER_ID,
            productName: "後払いの商品",
            quantity: 1,
            orderedQuantity: 3,
          },
        ],
      },
    ]);
    expect(detail?.reviewedByAdminName).toBeNull();
    expect(detail?.approvedAt).toBeNull();
    expect(detail?.adminNote).toBeNull();
  });

  it("運営者が作った申請の詳細は、申請者が無く、作成した運営者の名前を持つ", async () => {
    const detail = await queryService.findDetail(ADMIN_CREATED_RETURN_ID);

    expect(detail?.requester).toBeNull();
    expect(detail?.createdByAdminName).toBe("運営 花子");
  });

  it("存在しない申請・UUID の形でないIDの詳細は null", async () => {
    expect(
      await queryService.findDetail("00000000-0000-0000-0000-000000383299")
    ).toBeNull();
    expect(await queryService.findDetail("not-a-uuid")).toBeNull();
  });
});

describe("SupabaseReturnRepository の運営者向けの処理（service role）", () => {
  const repo = new SupabaseReturnRepository(adminClient);

  it("findById は申請を状態・明細・承認日時と一緒に復元する。無ければ null", async () => {
    const found = await repo.findById(SECOND_RETURN_ID);
    expect(found).toMatchObject({
      id: SECOND_RETURN_ID,
      orderId: ORDER_ID,
      status: "approved",
      requestedByUserId: USER_ID,
      reason: "誤配送: 色違い",
      items: [{ orderItemId: ITEM_PAID_ID, quantity: 1 }],
    });
    expect(found?.approvedAt?.toISOString()).toBe(
      new Date(APPROVED_AT).toISOString()
    );

    expect(
      await repo.findById("00000000-0000-0000-0000-000000383299")
    ).toBeNull();
    expect(await repo.findById("not-a-uuid")).toBeNull();
  });

  it("saveReview は、DB上の申請が requested なら状態・承認日時・確認した運営者・メモを書き換えて true を返す", async () => {
    const approved = (await repo.findById(FIRST_PAID_RETURN_ID))!.approve(
      new Date(APPROVED_AT)
    );

    expect(
      await repo.saveReview(approved, {
        adminUserId: ADMIN_USER_ID,
        adminNote: "承認メモ",
      })
    ).toBe(true);

    const row = await returnRow(FIRST_PAID_RETURN_ID);
    expect(row).toMatchObject({
      status: "approved",
      reviewed_by_admin_user_id: ADMIN_USER_ID,
      admin_note: "承認メモ",
    });
    expect(new Date(row.approved_at!).toISOString()).toBe(
      new Date(APPROVED_AT).toISOString()
    );
  });

  it("saveReview は、読んだ後に顧客が取り消していた（DB上が requested でない）なら何も書き換えず false を返す", async () => {
    const approved = (await repo.findById(FIRST_PAID_RETURN_ID))!.approve(
      new Date(APPROVED_AT)
    );
    const { error } = await adminClient
      .from("returns")
      .update({ status: "cancelled" })
      .eq("id", FIRST_PAID_RETURN_ID);
    if (error) throw error;

    expect(
      await repo.saveReview(approved, {
        adminUserId: ADMIN_USER_ID,
        adminNote: "承認メモ",
      })
    ).toBe(false);
    expect(await returnRow(FIRST_PAID_RETURN_ID)).toEqual({
      status: "cancelled",
      reviewed_by_admin_user_id: null,
      admin_note: null,
      approved_at: null,
    });
  });

  it("updateAdminNote は状態を問わずメモを書き換えて true を返す。申請が無ければ false", async () => {
    expect(
      await repo.updateAdminNote(SECOND_RETURN_ID, "返送ラベル送付済み")
    ).toBe(true);
    expect((await returnRow(SECOND_RETURN_ID)).admin_note).toBe(
      "返送ラベル送付済み"
    );
    expect(await repo.updateAdminNote(SECOND_RETURN_ID, null)).toBe(true);
    expect((await returnRow(SECOND_RETURN_ID)).admin_note).toBeNull();

    expect(
      await repo.updateAdminNote("00000000-0000-0000-0000-000000383299", "x")
    ).toBe(false);
  });

  it("findByOrderId も承認日時を復元する", async () => {
    const found = await repo.findByOrderId(ORDER_ID);
    expect(
      found.find((r) => r.id === SECOND_RETURN_ID)?.approvedAt?.toISOString()
    ).toBe(new Date(APPROVED_AT).toISOString());
  });
});

describe("管理画面のサーバーアクション（承認・却下・メモ）", () => {
  it("運営者は requested の申請を承認でき、確認した運営者とメモが記録される", async () => {
    asAdmin();

    expect(
      await approveReturnAction(FIRST_PAID_RETURN_ID, "  承認します ")
    ).toEqual({ success: true });

    const row = await returnRow(FIRST_PAID_RETURN_ID);
    expect(row).toMatchObject({
      status: "approved",
      reviewed_by_admin_user_id: ADMIN_USER_ID,
      admin_note: "承認します",
    });
    expect(row.approved_at).not.toBeNull();
    // 同じ送信のほかの申請は変わらない
    expect((await returnRow(FIRST_AFTER_ORDER_RETURN_ID)).status).toBe(
      "requested"
    );
  });

  it("運営者は requested の申請を却下でき、承認日時は記録されない", async () => {
    asAdmin();

    expect(await rejectReturnAction(FIRST_PAID_RETURN_ID, "")).toEqual({
      success: true,
    });

    expect(await returnRow(FIRST_PAID_RETURN_ID)).toEqual({
      status: "rejected",
      reviewed_by_admin_user_id: ADMIN_USER_ID,
      admin_note: null,
      approved_at: null,
    });
  });

  it("requested でない申請の承認・却下はエラーを返し、状態は変わらない", async () => {
    asAdmin();

    expect(await approveReturnAction(ADMIN_CREATED_RETURN_ID, "")).toEqual({
      error: expect.any(String),
    });
    expect(await rejectReturnAction(SECOND_RETURN_ID, "")).toEqual({
      error: expect.any(String),
    });
    expect((await returnRow(ADMIN_CREATED_RETURN_ID)).status).toBe("cancelled");
    expect((await returnRow(SECOND_RETURN_ID)).status).toBe("approved");
  });

  it("運営者は状態を問わずメモを編集できる", async () => {
    asAdmin();

    expect(
      await updateReturnAdminNoteAction(SECOND_RETURN_ID, "返送受領待ち")
    ).toEqual({ success: true });
    expect((await returnRow(SECOND_RETURN_ID)).admin_note).toBe("返送受領待ち");
  });

  it("存在しない申請・UUID の形でないIDはエラーを返す", async () => {
    asAdmin();

    for (const id of ["00000000-0000-0000-0000-000000383299", "not-a-uuid"]) {
      expect(await approveReturnAction(id, "")).toEqual({
        error: expect.any(String),
      });
      expect(await updateReturnAdminNoteAction(id, "x")).toEqual({
        error: expect.any(String),
      });
    }
  });

  it.each([
    [
      "会員",
      {
        userId: "clerk_test_admin_returns_member",
        sessionClaims: { metadata: {} },
      },
    ],
    ["ログインしていない人", { userId: null, sessionClaims: null }],
  ])(
    "%s は承認・却下・メモの編集ができず、申請は変わらない",
    async (_, session) => {
      requireAuthMock.mockResolvedValue(session);

      for (const result of [
        await approveReturnAction(FIRST_PAID_RETURN_ID, "x"),
        await rejectReturnAction(FIRST_PAID_RETURN_ID, "x"),
        await updateReturnAdminNoteAction(FIRST_PAID_RETURN_ID, "x"),
      ]) {
        expect(result).toEqual({ error: "権限がありません" });
      }
      expect(await returnRow(FIRST_PAID_RETURN_ID)).toEqual({
        status: "requested",
        reviewed_by_admin_user_id: null,
        admin_note: null,
        approved_at: null,
      });
    }
  );
});
