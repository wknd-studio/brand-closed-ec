import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { reconstituteOrder } from "@/domain/entities/order";
import { reconstituteOrderItem } from "@/domain/entities/order-item";
import { OrderNumber } from "@/domain/value-objects/order-number";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import { randomOrderNumber } from "../helpers/order-number";

// orders.order_number（#754）: 画面に出すたびに注文ID（UUID）の先頭8文字から作っていた注文番号を、
// 重ならない保証のある列として保存する。番号の形の決まりは OrderNumber（domain）にだけ置き、
// 番号はアプリが注文を作るときに作る。DB は重ならないこと（UNIQUE）と形（CHECK）を守るだけで、
// 番号を作らない（DEFAULT も関数も無い）

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）。
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signTestJwt(claims: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  return `${headerPart}.${payloadPart}.${base64url(signature)}`;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabase = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function clientAs(clerkUserId: string) {
  return createClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${signTestJwt({ sub: clerkUserId })}`,
        },
      },
    }
  );
}

const USER_A_ID = "00000000-0000-0000-0000-0000007540a1";
const USER_B_ID = "00000000-0000-0000-0000-0000007540b1";
const CLERK_A = "clerk_test_order_number_a";
const CLERK_B = "clerk_test_order_number_b";

// 直接の insert で作る注文
const ORDER_A_ID = "00000000-0000-0000-0000-000000754001";
const ORDER_B_ID = "00000000-0000-0000-0000-000000754002";
// repository（DB関数）で作る注文
const ORDER_PLACED_ID = "00000000-0000-0000-0000-000000754011";
const ORDER_SAVED_ID = "00000000-0000-0000-0000-000000754012";
const ITEM_PLACED_ID = "00000000-0000-0000-0000-000000754111";
const ITEM_SAVED_ID = "00000000-0000-0000-0000-000000754112";
// 制約で拒否される注文
const ORDER_REJECTED_ID = "00000000-0000-0000-0000-000000754022";
const ALL_ORDER_IDS = [
  ORDER_A_ID,
  ORDER_B_ID,
  ORDER_PLACED_ID,
  ORDER_SAVED_ID,
  ORDER_REJECTED_ID,
];

const SYSTEM = { type: "system" } as const;

const baseOrder = {
  shipping_address_snapshot: {},
  billing_address_snapshot: {},
  rank_at_order: "basic" as const,
  monthly_limit_at_order: 1_000_000,
  status: "paid",
};

const snapshotProps = {
  recipientLastName: "テスト",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

function makeOrder(id: string, itemId: string, orderNumber: OrderNumber) {
  return reconstituteOrder({
    id,
    userId: USER_A_ID,
    orderNumber,
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("basic"),
    monthlyLimitAtOrder: MonthlyLimit.unlimited(),
    items: [
      reconstituteOrderItem({
        id: itemId,
        sanityProductId: "prod-754",
        productNameSnapshot: "テスト商品",
        unitPriceSnapshot: Money.of(10_000),
        quantity: 1,
        isNegotiable: false,
        negotiatedUnitPrice: null,
        paymentTiming: "after_order",
        settlementId: null,
      }),
    ],
    settlements: [],
    createdAt: new Date(),
  });
}

async function cleanup() {
  await supabase
    .from("order_status_changes")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
}

async function orderNumberOf(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data.order_number;
}

const ORDER_A_NUMBER = randomOrderNumber();
const ORDER_B_NUMBER = randomOrderNumber();

beforeAll(async () => {
  await cleanup();
  for (const [id, clerkId] of [
    [USER_A_ID, CLERK_A],
    [USER_B_ID, CLERK_B],
  ]) {
    const { error } = await supabase.from("users").insert({
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

  const { error } = await supabase.from("orders").insert([
    {
      ...baseOrder,
      id: ORDER_A_ID,
      user_id: USER_A_ID,
      order_number: ORDER_A_NUMBER,
    },
    {
      ...baseOrder,
      id: ORDER_B_ID,
      user_id: USER_B_ID,
      order_number: ORDER_B_NUMBER,
    },
  ]);
  if (error) throw error;
});

afterAll(cleanup);

describe("注文番号の保存と読み戻し（SupabaseOrderRepository）", () => {
  const repo = new SupabaseOrderRepository(supabase);

  it("place_order_with_limit_check で保存した注文の番号を読み戻せる", async () => {
    const orderNumber = OrderNumber.of(randomOrderNumber());
    const period = MonthlyPeriod.fromBillingAnchorDay(10);

    await repo.saveNewOrderWithLimitCheck(
      makeOrder(ORDER_PLACED_ID, ITEM_PLACED_ID, orderNumber),
      period,
      MonthlyLimit.unlimited(),
      Money.of(0)
    );

    expect(await orderNumberOf(ORDER_PLACED_ID)).toBe(orderNumber.value);
    const reloaded = await repo.findById(ORDER_PLACED_ID);
    expect(reloaded!.orderNumber.equals(orderNumber)).toBe(true);
  });

  it("save_order で保存した注文の番号を読み戻せ、保存し直しても番号は変わらない", async () => {
    const orderNumber = OrderNumber.of(randomOrderNumber());

    await repo.save(
      makeOrder(ORDER_SAVED_ID, ITEM_SAVED_ID, orderNumber),
      SYSTEM
    );
    expect(await orderNumberOf(ORDER_SAVED_ID)).toBe(orderNumber.value);

    const loaded = await repo.findById(ORDER_SAVED_ID);
    await repo.save(loaded!.cancel(new Date()), SYSTEM);

    const reloaded = await repo.findById(ORDER_SAVED_ID);
    expect(reloaded!.status.value).toBe("cancelled");
    expect(reloaded!.orderNumber.equals(orderNumber)).toBe(true);
  });
});

describe("save_order の保存し直し", () => {
  it("既存の注文に別の番号を渡しても、番号は更新しない", async () => {
    // repository は読み戻した番号をそのまま渡すため、DB の側で番号を変えないことを関数を直接呼んで確かめる
    const repo = new SupabaseOrderRepository(supabase);
    const loaded = (await repo.findById(ORDER_SAVED_ID))!;
    const before = loaded.orderNumber.value;
    let other = randomOrderNumber();
    while (other === before) other = randomOrderNumber();

    const { error } = await supabase.rpc("save_order", {
      p_order: {
        id: ORDER_SAVED_ID,
        user_id: USER_A_ID,
        order_number: other,
        status: loaded.status.value,
        shipping_address_snapshot: snapshotProps,
        billing_address_snapshot: snapshotProps,
        rank_at_order: "basic",
        monthly_limit_at_order: null,
        created_at: loaded.createdAt.toISOString(),
        version: loaded.version,
      },
      p_settlements: [],
      p_items: [],
      p_status_change: { changed_by: "system" },
    });
    if (error) throw error;

    expect(await orderNumberOf(ORDER_SAVED_ID)).toBe(before);
  });
});

describe("orders.order_number の制約", () => {
  it("指定した番号はそのまま入る", async () => {
    expect(await orderNumberOf(ORDER_A_ID)).toBe(ORDER_A_NUMBER);
  });

  it("既存の注文と同じ番号は UNIQUE 制約で入れられない", async () => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_REJECTED_ID,
      user_id: USER_A_ID,
      order_number: ORDER_A_NUMBER,
    });

    expect(error?.code).toBe("23505");
  });

  it.each([
    ["小文字", "k7q2m9xd"],
    ["Crockford Base32 に無い文字（I・L・O・U）", "K7Q2M9XI"],
    ["ハイフン付き", "K7Q2-M9XD"],
    ["7文字", "K7Q2M9X"],
    ["9文字", "K7Q2M9XDA"],
  ])("形の違う番号（%s）は CHECK 制約で入れられない", async (_, value) => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_REJECTED_ID,
      user_id: USER_A_ID,
      order_number: value,
    });

    expect(error?.code).toBe("23514");
  });

  it("番号を渡さなければ入れられない（DB は番号を作らない）", async () => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_REJECTED_ID,
      user_id: USER_A_ID,
    } as Database["public"]["Tables"]["orders"]["Insert"]);

    expect(error?.code).toBe("23502");
  });
});

describe("orders.order_number の RLS", () => {
  it("会員は自分の注文の番号だけを読める", async () => {
    const { data, error } = await clientAs(CLERK_A)
      .from("orders")
      .select("id, order_number")
      .in("id", [ORDER_A_ID, ORDER_B_ID]);
    if (error) throw error;

    expect(data).toEqual([{ id: ORDER_A_ID, order_number: ORDER_A_NUMBER }]);
  });
});
