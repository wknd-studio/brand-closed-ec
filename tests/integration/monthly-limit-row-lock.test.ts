import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder } from "@/use-cases/place-order";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import type { ProductRepository } from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import { Money } from "@/domain/value-objects/money";

// 月次上限チェックの行ロック（issue #220追記・#267、docs/domain/settlement.md
// 「同一顧客の同時注文による競合の防止・完全排除」）を検証する。
// supabase-jsはリクエストをまたいだトランザクションを張れないため、行ロックは
// place_order_with_limit_check RPC（1回のDB呼び出し）の中で完結させている。

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000090";
const TEST_CLERK_ID = "clerk_test_monthly_limit_row_lock";
const TEST_ADDRESS_ID = "00000000-0000-0000-0000-000000000091";
// starterランクの月次上限は300,000円。1回200,000円（単体では上限内）の商品を
// 2回同時注文すると合計400,000円になり上限を超える。行ロックが無ければ両方とも
// 「確定済み0円＋今回分200,000円」だけで判定され、両方とも上限を通過してしまう
const UNIT_PRICE = 200_000;

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
}

function makeDeps() {
  const productRepo: ProductRepository = {
    findByIds: vi.fn().mockResolvedValue([
      {
        sanityProductId: "prod-lock-test",
        productName: "行ロックテスト用商品",
        unitPrice: Money.of(UNIT_PRICE),
        isNegotiable: false,
        minRank: "starter",
        paymentTiming: "at_order",
      },
    ]),
  };
  const paymentGateway: PaymentGateway = {
    createCheckoutSession: vi.fn().mockImplementation(async () => ({
      sessionId: `cs_test_monthly_limit_row_lock_${crypto.randomUUID()}`,
      url: "https://checkout.stripe.com/test",
    })),
    createInvoiceForOrder: vi.fn(),
    ensureCustomer: vi.fn(),
  };
  const notificationService: NotificationService = {
    sendOrderConfirming: vi.fn().mockResolvedValue(undefined),
    sendOrderOperatorNotification: vi.fn().mockResolvedValue(undefined),
    sendLimitExceeded: vi.fn(),
    sendShippingNotification: vi.fn(),
    sendDeliveryNotification: vi.fn(),
    sendCheckoutPaid: vi.fn(),
    sendInvoicePaid: vi.fn(),
  };
  return { productRepo, paymentGateway, notificationService };
}

async function runPlaceOrder() {
  const userRepo = new SupabaseUserRepository(supabase);
  const orderRepo = new SupabaseOrderRepository(supabase);
  const addressRepo = new SupabaseAddressRepository(supabase);
  const { productRepo, paymentGateway, notificationService } = makeDeps();

  return placeOrder(
    {
      clerkUserId: TEST_CLERK_ID,
      cartItems: [
        {
          sanityProductId: "prod-lock-test",
          quantity: 1,
          productName: "行ロックテスト用商品",
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
}

beforeAll(async () => {
  await cleanup();

  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "monthly-limit-row-lock-test@example.com",
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
});

afterAll(async () => {
  await cleanup();
});

describe("月次上限チェックの行ロック", () => {
  it("同一顧客の同時注文は直列化され、片方だけが成功し合計は上限内に収まる", async () => {
    const results = await Promise.allSettled([
      runPlaceOrder(),
      runPlaceOrder(),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // 行ロックが効いていれば、2回目は1回目が確定させた金額を見て上限超過と判定される
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      LimitExceededError
    );

    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_items(unit_price_snapshot, quantity)")
      .eq("user_id", TEST_USER_ID);

    // 上限超過した側は注文自体が保存されていないこと
    expect(orders).toHaveLength(1);
    const total = orders![0].order_items.reduce(
      (sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity,
      0
    );
    // 2件とも保存されていれば合計は UNIT_PRICE * 2 になってしまう。行ロックにより
    // 1件分（UNIT_PRICE）しか保存されていないことを確認する
    expect(total).toBe(UNIT_PRICE);
  });
});
