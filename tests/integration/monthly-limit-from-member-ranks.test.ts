import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder } from "@/use-cases/place-order";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import { SupabaseMemberRankRepository } from "@/infrastructure/supabase/supabase-member-rank-repository";
import { SupabaseSubscriptionRepository } from "@/infrastructure/supabase/supabase-subscription-repository";
import { SupabaseMemberQueryService } from "@/infrastructure/supabase/supabase-member-query-service";
import type { ProductRepository } from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

// 月間仕入れ上限の金額の正は member_ranks.monthly_limit_amount（NULL = 無制限）。issue #210
//
// member_ranks の値を書き換えるテストは、このファイルにだけ置く（統合テストはファイル単位で並列に
// 動くため、別のファイルで同じ行を書き換えると互いに壊し合う）。書き換えるのは、ほかの統合テストが
// 上限の金額に依存していない premium だけにし、上位ランクほど上限が大きい並びも崩さない値にする

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const PREMIUM_USER_ID = "00000000-0000-0000-0000-000000002101";
const PREMIUM_CLERK_ID = "clerk_test_monthly_limit_from_ranks_premium";
const PREMIUM_ADDRESS_ID = "00000000-0000-0000-0000-000000002102";
const ENTERPRISE_USER_ID = "00000000-0000-0000-0000-000000002103";
const ENTERPRISE_CLERK_ID = "clerk_test_monthly_limit_from_ranks_enterprise";
const ENTERPRISE_ADDRESS_ID = "00000000-0000-0000-0000-000000002104";
const USER_IDS = [PREMIUM_USER_ID, ENTERPRISE_USER_ID];

// premium の初期値（100,000,000）から下げた値。advanced（50,000,000）よりは大きい
const CHANGED_PREMIUM_LIMIT = 60_000_000;
let originalPremiumLimit: number | null;

async function cleanup() {
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .in("user_id", USER_IDS);
  const orderIds = orders?.map((o) => o.id) ?? [];
  if (orderIds.length > 0) {
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("order_settlements").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }
  await supabase
    .from("addresses")
    .delete()
    .in("id", [PREMIUM_ADDRESS_ID, ENTERPRISE_ADDRESS_ID]);
  await supabase.from("users").delete().in("id", USER_IDS);
}

async function insertMember(
  id: string,
  clerkUserId: string,
  addressId: string,
  rankCode: string
) {
  const { error: userError } = await supabase.from("users").insert({
    id,
    clerk_user_id: clerkUserId,
    email: `${clerkUserId}@example.com`,
    first_name: "テスト",
    last_name: "太郎",
    rank_code: rankCode,
    onboarding_completed: true,
    billing_anchor_day: 1,
  });
  if (userError) throw userError;
  const { error: addressError } = await supabase.from("addresses").insert({
    id: addressId,
    user_id: id,
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
  if (addressError) throw addressError;
}

async function setPremiumLimit(amount: number | null) {
  const { error } = await supabase
    .from("member_ranks")
    .update({ monthly_limit_amount: amount })
    .eq("code", "premium");
  if (error) throw error;
}

function runPlaceOrder(
  clerkUserId: string,
  addressId: string,
  unitPrice: number
) {
  const productRepo: ProductRepository = {
    findByIds: vi.fn().mockResolvedValue([
      {
        sanityProductId: "prod-limit-from-ranks",
        productName: "上限テスト用商品",
        unitPrice: Money.of(unitPrice),
        isNegotiable: false,
        minRank: "starter",
        availability: "available",
        // 決済単位を作らない（Checkout を呼ばない）注文にする
        paymentTiming: "after_order",
      },
    ]),
  };
  const paymentGateway: PaymentGateway = {
    createCheckoutSession: vi.fn(),
    createInvoiceForOrder: vi.fn(),
  };
  const notificationService: NotificationService = {
    sendOrderConfirming: vi.fn().mockResolvedValue(undefined),
    sendLimitExceeded: vi.fn(),
    sendShippingNotification: vi.fn(),
    sendDeliveryNotification: vi.fn(),
    sendCheckoutPaid: vi.fn(),
  };

  return placeOrder(
    {
      clerkUserId,
      cartItems: [
        {
          sanityProductId: "prod-limit-from-ranks",
          quantity: 1,
          productName: "上限テスト用商品",
        },
      ],
      shippingAddressId: addressId,
      billingAddressId: addressId,
      baseUrl: "http://localhost:3000",
    },
    {
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
    }
  );
}

async function ordersOf(userId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, monthly_limit_at_order")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await cleanup();
  const { data, error } = await supabase
    .from("member_ranks")
    .select("monthly_limit_amount")
    .eq("code", "premium")
    .single();
  if (error) throw error;
  originalPremiumLimit = data.monthly_limit_amount;

  await insertMember(
    PREMIUM_USER_ID,
    PREMIUM_CLERK_ID,
    PREMIUM_ADDRESS_ID,
    "premium"
  );
  await insertMember(
    ENTERPRISE_USER_ID,
    ENTERPRISE_CLERK_ID,
    ENTERPRISE_ADDRESS_ID,
    "enterprise"
  );
});

afterAll(async () => {
  await setPremiumLimit(originalPremiumLimit);
  await cleanup();
});

describe("SupabaseMemberRankRepository.findMonthlyLimit", () => {
  it("ランクの member_ranks.monthly_limit_amount を上限として返す", async () => {
    const limit = await new SupabaseMemberRankRepository(
      supabase
    ).findMonthlyLimit(MemberRank.of("starter"));

    expect(limit.isUnlimited()).toBe(false);
    expect(limit.amount).toBe(300_000);
  });

  it("monthly_limit_amount が NULL のランク（enterprise）は無制限を返す", async () => {
    const limit = await new SupabaseMemberRankRepository(
      supabase
    ).findMonthlyLimit(MemberRank.of("enterprise"));

    expect(limit.isUnlimited()).toBe(true);
  });
});

describe("member_ranks の上限を書き換えたとき（premium）", () => {
  it("注文確定時の上限チェックとカートの上限表示の両方に、書き換えた値が反映される", async () => {
    await setPremiumLimit(CHANGED_PREMIUM_LIMIT);

    // カートの上限表示（会員の画面の共通レイアウト）
    const layout = await new SupabaseMemberQueryService(
      supabase
    ).findMemberLayout(PREMIUM_CLERK_ID);
    expect(layout?.monthlyLimit).toBe(CHANGED_PREMIUM_LIMIT);

    // 注文確定時の上限チェック: 書き換え前の上限（100,000,000）なら通る 70,000,000 の注文が弾かれる
    await expect(
      runPlaceOrder(PREMIUM_CLERK_ID, PREMIUM_ADDRESS_ID, 70_000_000)
    ).rejects.toThrow(LimitExceededError);
    expect(await ordersOf(PREMIUM_USER_ID)).toEqual([]);

    // 上限内の注文は通り、注文時の上限として書き換えた値が保存される
    await runPlaceOrder(PREMIUM_CLERK_ID, PREMIUM_ADDRESS_ID, 50_000_000);
    expect(await ordersOf(PREMIUM_USER_ID)).toEqual([
      expect.objectContaining({
        monthly_limit_at_order: CHANGED_PREMIUM_LIMIT,
      }),
    ]);
  });
});

describe("上限が無制限（enterprise。monthly_limit_amount = NULL）の会員", () => {
  it("どれだけ大きな金額でも注文確定時の上限チェックで弾かれず、注文時の上限は NULL で保存される", async () => {
    await runPlaceOrder(
      ENTERPRISE_CLERK_ID,
      ENTERPRISE_ADDRESS_ID,
      1_000_000_000
    );
    await runPlaceOrder(
      ENTERPRISE_CLERK_ID,
      ENTERPRISE_ADDRESS_ID,
      1_000_000_000
    );

    const orders = await ordersOf(ENTERPRISE_USER_ID);
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.monthly_limit_at_order)).toEqual([null, null]);

    // 保存した注文を読み戻しても、注文時の上限は無制限のまま
    const order = await new SupabaseOrderRepository(supabase).findById(
      orders[0].id
    );
    expect(order?.monthlyLimitAtOrder.isUnlimited()).toBe(true);
  });

  it("カートの上限表示には無制限（null）を返す", async () => {
    const layout = await new SupabaseMemberQueryService(
      supabase
    ).findMemberLayout(ENTERPRISE_CLERK_ID);

    expect(layout?.monthlyLimit).toBeNull();
  });
});

describe("place_order_with_limit_check（DB関数）の上限0", () => {
  it("上限0は無制限として扱わず、価格のある注文を弾く", async () => {
    // アプリ側の判定（MonthlyLimit）と同じく、判定を飛ばすのは NULL のときだけ
    const { error } = await supabase.rpc("place_order_with_limit_check", {
      p_user_id: ENTERPRISE_USER_ID,
      p_period_start: MonthlyPeriod.fromBillingAnchorDay(1).start.toISOString(),
      p_period_end: MonthlyPeriod.fromBillingAnchorDay(1).end.toISOString(),
      p_monthly_limit: 0,
      p_cart_fixed_total: 1,
      p_order: {},
      p_items: [],
      p_settlement: null,
    });

    expect(error?.message).toContain("monthly_limit_exceeded");
  });
});
