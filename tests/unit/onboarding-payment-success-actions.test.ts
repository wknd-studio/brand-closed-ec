import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAuth, findOnboardingCompleted } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findOnboardingCompleted: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ requireAuth }));

// Supabaseへ直接クエリすると from() が呼ばれて失敗する
vi.mock("@/infrastructure/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: () => {
      throw new Error("Supabaseへの直接クエリは禁止");
    },
  }),
}));

vi.mock("@/composition/member-query", () => ({
  memberQueryService: async () => ({ findOnboardingCompleted }),
}));

import { isOnboardingCompleted } from "@/app/onboarding/payment/success/actions";

describe("isOnboardingCompleted（Query Service 経由）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ userId: "clerk_1" });
  });

  it("Query Service が返した入会の確定をそのまま返す", async () => {
    findOnboardingCompleted.mockResolvedValue(true);
    expect(await isOnboardingCompleted()).toBe(true);
    expect(findOnboardingCompleted).toHaveBeenCalledWith("clerk_1");

    findOnboardingCompleted.mockResolvedValue(false);
    expect(await isOnboardingCompleted()).toBe(false);
  });

  it("未ログインのときは問い合わせずに false", async () => {
    requireAuth.mockResolvedValue({ userId: null });

    expect(await isOnboardingCompleted()).toBe(false);
    expect(findOnboardingCompleted).not.toHaveBeenCalled();
  });
});
