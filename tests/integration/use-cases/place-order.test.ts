import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder } from "@/use-cases/place-order";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import type { ProductRepository } from "@/repositories/product-repository";
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

function makeDeps() {
  const productRepo: ProductRepository = {
    findByIds: vi.fn().mockResolvedValue([
      {
        sanityProductId: "prod-test",
        productName: "テスト商品",
        unitPrice: Money.of(100_000),
        isNegotiable: false,
        minRank: "starter",
      },
    ]),
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
