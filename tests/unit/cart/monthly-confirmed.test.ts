import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemberRank } from "@/domain/value-objects/member-rank";

const findByClerkUserId = vi.fn();
const sumConfirmedAmountByUserId = vi.fn();

// Supabaseへ直接クエリすると from() が呼ばれて失敗する
vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: () => {
      throw new Error("Supabaseへの直接クエリは禁止");
    },
  }),
}));
vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(function () {
    return { findByClerkUserId };
  }),
}));
vi.mock("@/infrastructure/supabase/supabase-order-repository", () => ({
  SupabaseOrderRepository: vi.fn(function () {
    return { sumConfirmedAmountByUserId };
  }),
}));

import { getMonthlyUsageInfo } from "@/lib/cart/monthly-confirmed";

describe("getMonthlyUsageInfo（repository経由）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("UserRepositoryのランクと、OrderRepositoryの確定額を返す", async () => {
    findByClerkUserId.mockResolvedValue({
      id: "user-1",
      rank: MemberRank.of("advanced"),
      billingAnchorDay: 15,
    });
    sumConfirmedAmountByUserId.mockResolvedValue(3_200_000);

    const info = await getMonthlyUsageInfo("clerk_1");

    expect(info).toEqual({
      confirmedAmount: 3_200_000,
      monthlyLimit: 50_000_000,
    });
    expect(findByClerkUserId).toHaveBeenCalledWith("clerk_1");
    expect(sumConfirmedAmountByUserId).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        start: expect.any(Date),
        end: expect.any(Date),
      })
    );
  });

  it("会員が見つからなければ確定額・上限とも0を返す", async () => {
    findByClerkUserId.mockResolvedValue(null);

    const info = await getMonthlyUsageInfo("clerk_missing");

    expect(info).toEqual({ confirmedAmount: 0, monthlyLimit: 0 });
    expect(sumConfirmedAmountByUserId).not.toHaveBeenCalled();
  });
});
