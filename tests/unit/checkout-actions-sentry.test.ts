import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/use-cases/place-order", () => ({
  placeOrder: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));
vi.mock("@/infrastructure/supabase/supabase-order-repository", () => ({
  SupabaseOrderRepository: vi.fn(),
}));
vi.mock("@/infrastructure/supabase/supabase-address-repository", () => ({
  SupabaseAddressRepository: vi.fn(),
}));
vi.mock("@/infrastructure/sanity/sanity-product-repository", () => ({
  SanityProductRepository: vi.fn(),
}));
vi.mock("@/infrastructure/stripe/stripe-payment-gateway", () => ({
  StripePaymentGateway: vi.fn(),
}));
vi.mock("@/infrastructure/resend/resend-notification-service", () => ({
  ResendNotificationService: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { placeOrder as placeOrderUseCase } from "@/use-cases/place-order";
import { placeOrder } from "@/app/(member)/order/checkout/actions";

function mockCartCookie() {
  const cart = {
    items: [{ productId: "prod-1", quantity: 1, productName: "テスト商品" }],
  };
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn(() => ({
      value: encodeURIComponent(JSON.stringify(cart)),
    })),
  } as never);
}

describe("placeOrder Server Action - Sentry例外送信", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    mockCartCookie();
  });

  it("予期しないエラー時にSentry.captureExceptionを呼ぶ", async () => {
    const error = new Error("DB接続エラー");
    vi.mocked(placeOrderUseCase).mockRejectedValue(error);

    const result = await placeOrder("addr-1", "addr-1");

    expect(result).toEqual({ error: "注文の処理中にエラーが発生しました" });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "placeOrder" }),
      })
    );
  });

  it("LimitExceededErrorの場合はSentry.captureExceptionを呼ばない", async () => {
    const { LimitExceededError } =
      await import("@/domain/errors/limit-exceeded-error");
    vi.mocked(placeOrderUseCase).mockRejectedValue(
      new LimitExceededError(358_000, 300_000)
    );

    await placeOrder("addr-1", "addr-1");

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
