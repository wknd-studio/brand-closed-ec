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
    createCheckoutSession: vi.fn().mockResolvedValue({
      sessionId: "cs_test_place_order_infra",
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
    rank: "advanced",
    onboarding_completed: true,
    subscribed_at: new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString(),
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
      .update({ rank: "premium" })
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
    rank: "advanced",
    onboarding_completed: true,
    subscribed_at: new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString(),
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

describe("placeOrder（実DB・支払いタイミング混在の分割チェックアウト）", () => {
  beforeAll(async () => {
    await cleanupSplitUser();
    await seedSplitUser();
  });

  afterAll(async () => {
    await cleanupSplitUser();
  });

  it("支払いタイミングが混在するカートは同一split_group_idを持つ2件のOrderとしてDBに保存される", async () => {
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
      }
    );

    expect(result.redirectUrl).toBe("https://checkout.stripe.com/test");

    const { data: orders } = await supabase
      .from("orders")
      .select("id, payment_flow, split_group_id, status")
      .eq("user_id", SPLIT_TEST_USER_ID);

    expect(orders).toHaveLength(2);

    const splitGroupIds = new Set(orders!.map((o) => o.split_group_id));
    expect(splitGroupIds.size).toBe(1);
    expect([...splitGroupIds][0]).not.toBeNull();

    const checkoutOrder = orders!.find((o) => o.payment_flow === "checkout");
    const invoiceOrder = orders!.find((o) => o.payment_flow === "invoice");
    expect(checkoutOrder?.status).toBe("pending_payment");
    expect(invoiceOrder?.status).toBe("confirming");

    const foundBySplitGroup = await orderRepo.findBySplitGroupId(
      [...splitGroupIds][0]!
    );
    expect(foundBySplitGroup.map((o) => o.id).sort()).toEqual(
      orders!.map((o) => o.id).sort()
    );
  });

  it("単一タイミングのみのカートはsplit_group_idがnullの1件のOrderとして保存される（後方互換）", async () => {
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
      }
    );

    const { data: orders } = await supabase
      .from("orders")
      .select("id, split_group_id")
      .eq("user_id", SPLIT_TEST_USER_ID);

    expect(orders).toHaveLength(1);
    expect(orders![0].split_group_id).toBeNull();
  });
});
