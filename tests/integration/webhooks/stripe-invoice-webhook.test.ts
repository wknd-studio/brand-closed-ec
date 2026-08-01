import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { placeOrder } from "@/use-cases/place-order";
import { issueInvoice } from "@/use-cases/issue-invoice";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import type { ProductRepository } from "@/repositories/product-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";
import { Money } from "@/domain/value-objects/money";
import { getStripe } from "@/lib/stripe";
import { POST } from "@/app/api/webhooks/stripe/route";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000080";
const TEST_CLERK_ID = "clerk_test_stripe_invoice_webhook";
const TEST_ADDRESS_ID = "00000000-0000-0000-0000-000000000081";
const TEST_STRIPE_CUSTOMER_ID = "cus_test_stripe_invoice_webhook_080";
const TEST_INVOICE_ID = "in_test_stripe_invoice_webhook_080";
const NEGOTIATED_UNIT_PRICE = 200_000;

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
        sanityProductId: "prod-negotiable-test",
        productName: "テスト要相談商品",
        unitPrice: Money.zero(),
        isNegotiable: true,
        minRank: "starter",
        paymentTiming: "after_order",
      },
    ]),
  };
  const paymentGateway: PaymentGateway = {
    createCheckoutSession: vi.fn(),
    createInvoiceForOrder: vi.fn().mockResolvedValue(TEST_INVOICE_ID),
    ensureCustomer: vi.fn().mockResolvedValue(TEST_STRIPE_CUSTOMER_ID),
  };
  const notificationService: NotificationService = {
    sendOrderConfirming: vi.fn().mockResolvedValue(undefined),
    sendOrderOperatorNotification: vi.fn().mockResolvedValue(undefined),
    sendLimitExceeded: vi.fn().mockResolvedValue(undefined),
    sendShippingNotification: vi.fn(),
    sendDeliveryNotification: vi.fn(),
    sendCheckoutPaid: vi.fn(),
    sendInvoicePaid: vi.fn().mockResolvedValue(undefined),
  };
  return { productRepo, paymentGateway, notificationService };
}

beforeAll(async () => {
  await cleanup();

  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "stripe-invoice-webhook-test@example.com",
    first_name: "テスト",
    last_name: "次郎",
    rank: "starter",
    onboarding_completed: true,
    subscribed_at: new Date().toISOString(),
  });

  await supabase.from("addresses").insert({
    id: TEST_ADDRESS_ID,
    user_id: TEST_USER_ID,
    type: "shipping",
    recipient_last_name: "テスト",
    recipient_first_name: "次郎",
    postal_code: "150-0001",
    prefecture: "東京都",
    city: "渋谷区",
    address_line1: "神宮前1-1-1",
    phone_number: "090-9876-5432",
    is_default: true,
  });

  const userRepo = new SupabaseUserRepository(supabase);
  const orderRepo = new SupabaseOrderRepository(supabase);
  const addressRepo = new SupabaseAddressRepository(supabase);
  const { productRepo, paymentGateway, notificationService } = makeDeps();

  // 実際にplaceOrderユースケース経由で要相談商品の注文（confirming、invoiceフロー）を作成する
  await placeOrder(
    {
      clerkUserId: TEST_CLERK_ID,
      cartItems: [
        {
          sanityProductId: "prod-negotiable-test",
          quantity: 1,
          productName: "テスト要相談商品",
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
    .select("id")
    .eq("user_id", TEST_USER_ID)
    .single();
  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", order!.id)
    .single();

  // 運営者による見積金額の確定・請求書発行（issueInvoiceユースケース経由）を行い、
  // invoice_sent・stripeInvoiceIdありの前提状態を作る（発行操作自体はBRAND-137で別スコープ）
  await issueInvoice(
    {
      orderId: order!.id,
      negotiatedPrices: { [orderItem!.id]: NEGOTIATED_UNIT_PRICE },
    },
    { orderRepo, userRepo, paymentGateway, notificationService }
  );
});

afterAll(async () => {
  await cleanup();
});

describe("Stripe請求書決済確定Webhook（実DB・署名検証込み）", () => {
  it("invoice.paidを受信すると、対象注文がpaidになる", async () => {
    const { data: before } = await supabase
      .from("orders")
      .select("status")
      .eq("user_id", TEST_USER_ID)
      .single();
    expect(before?.status).toBe("invoice_sent");

    const secret = process.env.STRIPE_WEBHOOK_SECRET!;
    const payload = JSON.stringify({
      id: "evt_test_stripe_invoice_webhook",
      object: "event",
      type: "invoice.paid",
      data: {
        object: {
          id: TEST_INVOICE_ID,
          object: "invoice",
        },
      },
    });
    const signature = getStripe().webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      })
    );

    expect(response.status).toBe(200);

    const { data: after } = await supabase
      .from("orders")
      .select("status")
      .eq("user_id", TEST_USER_ID)
      .single();
    expect(after?.status).toBe("paid");
  });
});
