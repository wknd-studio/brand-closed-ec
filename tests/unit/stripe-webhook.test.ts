import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/email/checkout-paid", () => ({
  sendCheckoutPaidEmails: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/invoice-paid", () => ({
  sendInvoicePaidEmail: vi.fn().mockResolvedValue(undefined),
}));

import { getStripe } from "@/lib/stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { POST } from "@/app/api/webhooks/stripe/route";

function makeRequest(body = "{}", signature = "valid-sig") {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });
}

function setupStripe(constructEvent: () => unknown) {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: {
      constructEvent: vi.fn().mockImplementation(constructEvent),
    },
  } as never);
}

function setupSupabaseForOnboarding(error: unknown = null) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error }),
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockReturnValue({ update: mockUpdate }),
  } as never);
  return mockUpdate;
}

function setupSupabaseForOrderPayment({
  orderStatus = "pending_payment",
  orderFound = true,
  updateError = null as unknown,
} = {}) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: orderFound
                  ? {
                      id: "order_1",
                      status: orderStatus,
                      user_id: "user_abc",
                      order_items: [],
                    }
                  : null,
              }),
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { email: "member@example.com" },
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as never);
  return mockUpdate;
}

function setupClerk() {
  const mockUpdateUserMetadata = vi.fn().mockResolvedValue({});
  vi.mocked(clerkClient).mockResolvedValue({
    users: { updateUserMetadata: mockUpdateUserMetadata },
  } as never);
  return mockUpdateUserMetadata;
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  describe("署名検証", () => {
    it("stripe-signature ヘッダーがない場合は 400 を返す", async () => {
      const req = new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("署名が不正な場合は 400 を返す", async () => {
      setupStripe(() => {
        throw new Error("invalid signature");
      });
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });
  });

  describe("checkout.session.completed - subscription mode（オンボーディング）", () => {
    const validSession = {
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          customer: "cus_test123",
          subscription: "sub_test123",
          metadata: { clerk_user_id: "user_abc", plan: "entry" },
        },
      },
    };

    it("Supabase と Clerk を更新して 200 を返す", async () => {
      setupStripe(() => validSession);
      const mockUpdate = setupSupabaseForOnboarding();
      const mockUpdateUserMetadata = setupClerk();

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          rank: "entry",
          stripe_customer_id: "cus_test123",
          stripe_subscription_id: "sub_test123",
          onboarding_completed: true,
        })
      );
      expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user_abc", {
        publicMetadata: { onboarding_completed: true },
      });
    });

    it("metadata に clerk_user_id がない場合は 400 を返す", async () => {
      setupStripe(() => ({
        ...validSession,
        data: {
          object: { ...validSession.data.object, metadata: { plan: "entry" } },
        },
      }));
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });

    it("metadata に plan がない場合は 400 を返す", async () => {
      setupStripe(() => ({
        ...validSession,
        data: {
          object: {
            ...validSession.data.object,
            metadata: { clerk_user_id: "user_abc" },
          },
        },
      }));
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });

    it("Supabase 更新が失敗した場合は 500 を返す", async () => {
      setupStripe(() => validSession);
      setupSupabaseForOnboarding({ message: "DB error" });

      const res = await POST(makeRequest());
      expect(res.status).toBe(500);
    });
  });

  describe("checkout.session.completed - payment mode（注文フロー）", () => {
    const makeEvent = (overrides: Record<string, unknown> = {}) => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_order_1",
          mode: "payment",
          metadata: { order_id: "order_1" },
          ...overrides,
        },
      },
    });

    it("pending_payment の注文を paid に更新して 200 を返す", async () => {
      setupStripe(() => makeEvent());
      const mockUpdate = setupSupabaseForOrderPayment({
        orderStatus: "pending_payment",
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({ status: "paid" });
    });

    it("すでに paid の注文はスキップして 200 を返す（冪等性）", async () => {
      setupStripe(() => makeEvent());
      const mockUpdate = setupSupabaseForOrderPayment({ orderStatus: "paid" });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("metadata に order_id がない場合は 400 を返す", async () => {
      setupStripe(() => makeEvent({ metadata: {} }));
      setupSupabaseForOrderPayment();

      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });

    it("注文が見つからない場合は 400 を返す", async () => {
      setupStripe(() => makeEvent());
      setupSupabaseForOrderPayment({ orderFound: false });

      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });

    it("DB 更新が失敗した場合は 500 を返す", async () => {
      setupStripe(() => makeEvent());
      setupSupabaseForOrderPayment({ updateError: { message: "DB error" } });

      const res = await POST(makeRequest());
      expect(res.status).toBe(500);
    });
  });

  describe("invoice.paid イベント（Invoice フロー）", () => {
    function setupSupabaseForInvoicePaid({
      orderStatus = "invoice_sent",
      orderFound = true,
      updateError = null as unknown,
    } = {}) {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      });
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "orders") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: orderFound
                      ? {
                          id: "order_1",
                          status: orderStatus,
                          user_id: "user_abc",
                        }
                      : null,
                  }),
                }),
              }),
              update: mockUpdate,
            };
          }
          if (table === "users") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { email: "member@example.com" },
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as never);
      return mockUpdate;
    }

    const makeInvoiceEvent = () => ({
      type: "invoice.paid",
      data: { object: { id: "inv_1" } },
    });

    it("invoice_sent の注文を paid に更新して 200 を返す", async () => {
      setupStripe(() => makeInvoiceEvent());
      const mockUpdate = setupSupabaseForInvoicePaid({
        orderStatus: "invoice_sent",
      });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({ status: "paid" });
    });

    it("すでに paid の注文はスキップして 200 を返す（冪等性）", async () => {
      setupStripe(() => makeInvoiceEvent());
      const mockUpdate = setupSupabaseForInvoicePaid({ orderStatus: "paid" });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("stripe_invoice_id が DB に存在しない場合は 200 を返す（他システムの Invoice）", async () => {
      setupStripe(() => makeInvoiceEvent());
      setupSupabaseForInvoicePaid({ orderFound: false });

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
    });

    it("DB 更新が失敗した場合は 500 を返す", async () => {
      setupStripe(() => makeInvoiceEvent());
      setupSupabaseForInvoicePaid({ updateError: { message: "DB error" } });

      const res = await POST(makeRequest());
      expect(res.status).toBe(500);
    });
  });

  describe("その他のイベント", () => {
    it("未処理イベントは DB 操作なしで 200 を返す", async () => {
      setupStripe(() => ({ type: "customer.subscription.updated", data: {} }));
      const mockFrom = vi.fn();
      vi.mocked(createAdminClient).mockReturnValue({ from: mockFrom } as never);

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
