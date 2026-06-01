import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server-admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { redirect } from "next/navigation";
import {
  advanceOrderStatus,
  cancelOrder,
} from "@/app/admin/orders/[id]/actions";

function setupAuth(role: string | null = "admin") {
  vi.mocked(auth).mockResolvedValue({
    sessionClaims: { metadata: { role } },
  } as never);
}

function buildSupabaseMock({
  orderStatus = "paid",
  updateError = null as unknown,
} = {}) {
  const updateEq = vi.fn().mockResolvedValue({ error: updateError });
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "orders")
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "order_1", status: orderStatus },
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      return {};
    }),
  } as never);
  return { updateEq };
}

describe("advanceOrderStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admin以外はエラーを返す", async () => {
    setupAuth(null);
    const result = await advanceOrderStatus("order_1", new FormData());
    expect(result).toEqual({ error: "権限がありません" });
  });

  it("paid → sourcing に更新してリダイレクト", async () => {
    setupAuth();
    const { updateEq } = buildSupabaseMock({ orderStatus: "paid" });
    await advanceOrderStatus("order_1", new FormData());
    expect(updateEq).toHaveBeenCalledWith("id", "order_1");
    expect(redirect).toHaveBeenCalledWith("/admin/orders/order_1");
  });

  it("sourcing → ordered に更新", async () => {
    setupAuth();
    buildSupabaseMock({ orderStatus: "sourcing" });
    await advanceOrderStatus("order_1", new FormData());
    expect(redirect).toHaveBeenCalledWith("/admin/orders/order_1");
  });

  it("delivered は次のステータスがないのでエラー", async () => {
    setupAuth();
    buildSupabaseMock({ orderStatus: "delivered" });
    const result = await advanceOrderStatus("order_1", new FormData());
    expect(result).toEqual({ error: "これ以上ステータスを進められません" });
  });

  it("DB更新失敗時はエラーを返す", async () => {
    setupAuth();
    buildSupabaseMock({ updateError: { message: "DB error" } });
    const result = await advanceOrderStatus("order_1", new FormData());
    expect(result).toEqual({ error: "ステータスの更新に失敗しました" });
  });
});

describe("cancelOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admin以外はエラーを返す", async () => {
    setupAuth(null);
    const result = await cancelOrder("order_1", "");
    expect(result).toEqual({ error: "権限がありません" });
  });

  it("注文をキャンセルしてリダイレクト", async () => {
    setupAuth();
    const { updateEq } = buildSupabaseMock({ orderStatus: "paid" });
    await cancelOrder("order_1", "顧客都合によるキャンセル");
    expect(updateEq).toHaveBeenCalledWith("id", "order_1");
    expect(redirect).toHaveBeenCalledWith("/admin/orders");
  });

  it("DB更新失敗時はエラーを返す", async () => {
    setupAuth();
    buildSupabaseMock({ updateError: { message: "DB error" } });
    const result = await cancelOrder("order_1", "");
    expect(result).toEqual({ error: "キャンセルに失敗しました" });
  });
});
