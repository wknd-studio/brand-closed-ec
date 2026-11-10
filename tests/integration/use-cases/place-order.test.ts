import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder } from "@/use-cases/place-order";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import type {
  ProductRepository,
  ProductSnapshot,
} from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import { Money } from "@/domain/value-objects/money";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000050";
const TEST_CLERK_ID = "clerk_test_place_order_infra";
const TEST_ADDRESS_ID = "00000000-0000-0000-0000-000000000051";

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

function makeDeps(
  products: ProductSnapshot[] = [
    {
      sanityProductId: "prod-test",
      productName: "テスト商品",
      unitPrice: Money.of(100_000),
      isNegotiable: false,
      minRank: "starter",
      paymentTiming: "at_order",
    },
  ]
) {
  const productRepo: ProductRepository = {
    findByIds: vi.fn().mockResolvedValue(products),
  };
  const paymentGateway: PaymentGateway = {
    // 実Stripeのセッションはユニークなため、決済単位のUNIQUE制約に合わせて呼び出しごとに採番する
    createCheckoutSession: vi.fn().mockImplementation(async () => ({
      sessionId: `cs_test_place_order_infra_${crypto.randomUUID()}`,
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

beforeAll(async () => {
  await cleanup();

  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "place-order-infra-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "advanced",
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

describe("placeOrder（実DB・7ランクのスナップショット）", () => {
  it("advancedランクで注文すると rankAtOrder が advanced で保存される", async () => {
    const userRepo = new SupabaseUserRepository(supabase);
    const orderRepo = new SupabaseOrderRepository(supabase);
    const addressRepo = new SupabaseAddressRepository(supabase);
    const { productRepo, paymentGateway, notificationService } = makeDeps();

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
        errorReporter: { captureException: vi.fn(), captureMessage: vi.fn() },
      }
    );

    const { data: order } = await supabase
      .from("orders")
      .select("rank_at_order, monthly_limit_at_order")
      .eq("user_id", TEST_USER_ID)
      .single();

    expect(order?.rank_at_order).toBe("advanced");
    expect(order?.monthly_limit_at_order).toBe(50_000_000);
  });

  it("注文後にユーザーのランクを変更しても、保存済み注文の rankAtOrder は変わらない", async () => {
    await supabase
      .from("users")
      .update({ rank_code: "premium" })
      .eq("id", TEST_USER_ID);

    const { data: order } = await supabase
      .from("orders")
      .select("rank_at_order, monthly_limit_at_order")
      .eq("user_id", TEST_USER_ID)
      .single();

    expect(order?.rank_at_order).toBe("advanced");
    expect(order?.monthly_limit_at_order).toBe(50_000_000);
  });
});

const SPLIT_TEST_USER_ID = "00000000-0000-0000-0000-000000000052";
const SPLIT_TEST_CLERK_ID = "clerk_test_place_order_split_infra";
const SPLIT_TEST_ADDRESS_ID = "00000000-0000-0000-0000-000000000053";

async function cleanupSplitUser() {
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", SPLIT_TEST_USER_ID);
  const orderIds = orders?.map((o) => o.id) ?? [];
  if (orderIds.length > 0) {
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("order_settlements").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }
  await supabase.from("addresses").delete().eq("id", SPLIT_TEST_ADDRESS_ID);
  await supabase.from("users").delete().eq("id", SPLIT_TEST_USER_ID);
}

async function seedSplitUser() {
  await supabase.from("users").insert({
    id: SPLIT_TEST_USER_ID,
    clerk_user_id: SPLIT_TEST_CLERK_ID,
    email: "place-order-split-infra-test@example.com",
    first_name: "テスト",
    last_name: "花子",
    rank_code: "advanced",
    onboarding_completed: true,
    billing_anchor_day: 1,
  });

  await supabase.from("addresses").insert({
    id: SPLIT_TEST_ADDRESS_ID,
    user_id: SPLIT_TEST_USER_ID,
    type: "shipping",
    recipient_last_name: "テスト",
    recipient_first_name: "花子",
    postal_code: "100-0001",
    prefecture: "東京都",
    city: "千代田区",
    address_line1: "丸の内1-1-1",
    phone_number: "03-1234-5678",
    is_default: true,
  });
}

describe("placeOrder（実DB・支払いタイミング混在の決済単位）", () => {
  beforeAll(async () => {
    await cleanupSplitUser();
    await seedSplitUser();
  });

  afterAll(async () => {
    await cleanupSplitUser();
  });

  it("支払いタイミングが混在するカートは1件のOrderとして保存され、at_order明細だけがCheckout決済単位に紐づく", async () => {
    await cleanupSplitUser();
    await seedSplitUser();

    const userRepo = new SupabaseUserRepository(supabase);
    const orderRepo = new SupabaseOrderRepository(supabase);
    const addressRepo = new SupabaseAddressRepository(supabase);
    const { productRepo, paymentGateway, notificationService } = makeDeps([
      {
        sanityProductId: "prod-split-at-order",
        productName: "先払い商品",
        unitPrice: Money.of(30_000),
        isNegotiable: false,
        minRank: "starter",
        paymentTiming: "at_order",
      },
      {
        sanityProductId: "prod-split-after-order",
        productName: "後払い商品",
        unitPrice: Money.of(70_000),
        isNegotiable: false,
        minRank: "starter",
        paymentTiming: "after_order",
      },
    ]);

    const result = await placeOrder(
      {
        clerkUserId: SPLIT_TEST_CLERK_ID,
        cartItems: [
          {
            sanityProductId: "prod-split-at-order",
            quantity: 1,
            productName: "先払い商品",
          },
          {
            sanityProductId: "prod-split-after-order",
            quantity: 1,
            productName: "後払い商品",
          },
        ],
        shippingAddressId: SPLIT_TEST_ADDRESS_ID,
        billingAddressId: SPLIT_TEST_ADDRESS_ID,
        baseUrl: "http://localhost:3000",
      },
      {
        userRepo,
        orderRepo,
        addressRepo,
        productRepo,
        paymentGateway,
        notificationService,
        errorReporter: { captureException: vi.fn(), captureMessage: vi.fn() },
      }
    );

    expect(result.redirectUrl).toBe("https://checkout.stripe.com/test");

    const { data: orders } = await supabase
      .from("orders")
      .select(
        "id, status, order_settlements(id, flow, status, amount_snapshot, stripe_checkout_session_id), order_items(sanity_product_id, payment_timing, settlement_id)"
      )
      .eq("user_id", SPLIT_TEST_USER_ID);

    expect(orders).toHaveLength(1);
    const order = orders![0];
    expect(order.status).toBe("processing");

    expect(order.order_settlements).toHaveLength(1);
    const settlement = order.order_settlements[0];
    expect(settlement).toMatchObject({
      flow: "checkout",
      status: "pending_payment",
      amount_snapshot: 30_000,
      stripe_checkout_session_id: expect.stringMatching(
        /^cs_test_place_order_infra_/
      ),
    });

    const atOrder = order.order_items.find(
      (i) => i.sanity_product_id === "prod-split-at-order"
    );
    const afterOrder = order.order_items.find(
      (i) => i.sanity_product_id === "prod-split-after-order"
    );
    expect(atOrder).toMatchObject({
      payment_timing: "at_order",
      settlement_id: settlement.id,
    });
    expect(afterOrder).toMatchObject({
      payment_timing: "after_order",
      settlement_id: null,
    });
  });

  it("after_orderのみのカートは決済単位を作らず、明細はsettlement_id=NULLで保存される", async () => {
    await cleanupSplitUser();
    await seedSplitUser();

    const userRepo = new SupabaseUserRepository(supabase);
    const orderRepo = new SupabaseOrderRepository(supabase);
    const addressRepo = new SupabaseAddressRepository(supabase);
    const { productRepo, paymentGateway, notificationService } = makeDeps([
      {
        sanityProductId: "prod-after-only",
        productName: "後払い商品",
        unitPrice: Money.of(70_000),
        isNegotiable: false,
        minRank: "starter",
        paymentTiming: "after_order",
      },
    ]);

    const result = await placeOrder(
      {
        clerkUserId: SPLIT_TEST_CLERK_ID,
        cartItems: [
          {
            sanityProductId: "prod-after-only",
            quantity: 1,
            productName: "後払い商品",
          },
        ],
        shippingAddressId: SPLIT_TEST_ADDRESS_ID,
        billingAddressId: SPLIT_TEST_ADDRESS_ID,
        baseUrl: "http://localhost:3000",
      },
      {
        userRepo,
        orderRepo,
        addressRepo,
        productRepo,
        paymentGateway,
        notificationService,
        errorReporter: { captureException: vi.fn(), captureMessage: vi.fn() },
      }
    );

    expect(result.redirectUrl).toContain("/order/invoice-complete?order_id=");
    expect(paymentGateway.createCheckoutSession).not.toHaveBeenCalled();

    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_settlements(id), order_items(settlement_id)")
      .eq("user_id", SPLIT_TEST_USER_ID);
    expect(orders).toHaveLength(1);
    expect(orders![0].order_settlements).toEqual([]);
    expect(orders![0].order_items[0].settlement_id).toBeNull();
  });

  it("単一タイミング（at_order）のみのカートは1件のOrderと1件のCheckout決済単位として保存される", async () => {
    await cleanupSplitUser();
    await seedSplitUser();

    const userRepo = new SupabaseUserRepository(supabase);
    const orderRepo = new SupabaseOrderRepository(supabase);
    const addressRepo = new SupabaseAddressRepository(supabase);
    const { productRepo, paymentGateway, notificationService } = makeDeps();

    await placeOrder(
      {
        clerkUserId: SPLIT_TEST_CLERK_ID,
        cartItems: [
          {
            sanityProductId: "prod-test",
            quantity: 1,
            productName: "テスト商品",
          },
        ],
        shippingAddressId: SPLIT_TEST_ADDRESS_ID,
        billingAddressId: SPLIT_TEST_ADDRESS_ID,
        baseUrl: "http://localhost:3000",
      },
      {
        userRepo,
        orderRepo,
        addressRepo,
        productRepo,
        paymentGateway,
        notificationService,
        errorReporter: { captureException: vi.fn(), captureMessage: vi.fn() },
      }
    );

    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_settlements(flow, status)")
      .eq("user_id", SPLIT_TEST_USER_ID);

    expect(orders).toHaveLength(1);
    expect(orders![0].order_settlements).toEqual([
      { flow: "checkout", status: "pending_payment" },
    ]);
  });
});

const OWNER_TEST_USER_ID = "00000000-0000-0000-0000-000000000619";
const OWNER_TEST_CLERK_ID = "clerk_test_place_order_address_owner";
const OTHER_TEST_USER_ID = "00000000-0000-0000-0000-00000000061a";
const OTHER_TEST_CLERK_ID = "clerk_test_place_order_address_other";
const OWNER_ADDRESS_ID = "00000000-0000-0000-0000-00000000061b";
const OTHER_ADDRESS_ID = "00000000-0000-0000-0000-00000000061c";

async function cleanupOwnerUsers() {
  const userIds = [OWNER_TEST_USER_ID, OTHER_TEST_USER_ID];
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .in("user_id", userIds);
  const orderIds = orders?.map((o) => o.id) ?? [];
  if (orderIds.length > 0) {
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("order_settlements").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }
  await supabase.from("addresses").delete().in("user_id", userIds);
  await supabase.from("users").delete().in("id", userIds);
}

describe("placeOrder（実DB・住所の持ち主。#619）", () => {
  beforeAll(async () => {
    await cleanupOwnerUsers();
    for (const [userId, clerkId, addressId, addressLine1] of [
      [
        OWNER_TEST_USER_ID,
        OWNER_TEST_CLERK_ID,
        OWNER_ADDRESS_ID,
        "注文者の住所1-1",
      ],
      [
        OTHER_TEST_USER_ID,
        OTHER_TEST_CLERK_ID,
        OTHER_ADDRESS_ID,
        "他の会員の住所2-2",
      ],
    ]) {
      const { error: userError } = await supabase.from("users").insert({
        id: userId,
        clerk_user_id: clerkId,
        email: `${clerkId}@example.com`,
        first_name: "テスト",
        last_name: "太郎",
        rank_code: "advanced",
        onboarding_completed: true,
        billing_anchor_day: 1,
      });
      if (userError) throw userError;
      const { error: addressError } = await supabase.from("addresses").insert({
        id: addressId,
        user_id: userId,
        type: "shipping",
        recipient_last_name: "テスト",
        recipient_first_name: "太郎",
        postal_code: "100-0001",
        prefecture: "東京都",
        city: "千代田区",
        address_line1: addressLine1,
        phone_number: "03-1234-5678",
        is_default: true,
      });
      if (addressError) throw addressError;
    }
  });

  afterAll(async () => {
    await cleanupOwnerUsers();
  });

  function placeOrderWith(shippingAddressId: string, billingAddressId: string) {
    const { productRepo, paymentGateway, notificationService } = makeDeps();
    return placeOrder(
      {
        clerkUserId: OWNER_TEST_CLERK_ID,
        cartItems: [
          {
            sanityProductId: "prod-test",
            quantity: 1,
            productName: "テスト商品",
          },
        ],
        shippingAddressId,
        billingAddressId,
        baseUrl: "http://localhost:3000",
      },
      {
        userRepo: new SupabaseUserRepository(supabase),
        orderRepo: new SupabaseOrderRepository(supabase),
        addressRepo: new SupabaseAddressRepository(supabase),
        productRepo,
        paymentGateway,
        notificationService,
        errorReporter: { captureException: vi.fn(), captureMessage: vi.fn() },
      }
    );
  }

  async function countOwnerOrders() {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", OWNER_TEST_USER_ID);
    return count ?? 0;
  }

  it.each([
    ["配送先", OTHER_ADDRESS_ID, OWNER_ADDRESS_ID],
    ["請求先", OWNER_ADDRESS_ID, OTHER_ADDRESS_ID],
  ])(
    "他の会員の住所を%sに指定すると「住所が見つかりません」で止まり、注文は保存されない",
    async (_label, shippingAddressId, billingAddressId) => {
      await expect(
        placeOrderWith(shippingAddressId, billingAddressId)
      ).rejects.toThrow("住所が見つかりません");
      expect(await countOwnerOrders()).toBe(0);
    }
  );

  it("自分の住所を指定すれば注文が保存され、その住所がスナップショットに入る", async () => {
    await placeOrderWith(OWNER_ADDRESS_ID, OWNER_ADDRESS_ID);

    const { data: orders } = await supabase
      .from("orders")
      .select("shipping_address_snapshot, billing_address_snapshot")
      .eq("user_id", OWNER_TEST_USER_ID);
    expect(orders).toHaveLength(1);
    expect(orders?.[0].shipping_address_snapshot).toMatchObject({
      addressLine1: "注文者の住所1-1",
    });
    expect(orders?.[0].billing_address_snapshot).toMatchObject({
      addressLine1: "注文者の住所1-1",
    });
  });
});
