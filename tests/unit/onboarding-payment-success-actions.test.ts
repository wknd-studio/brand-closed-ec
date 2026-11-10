import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAuth, findMemberStatus } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findMemberStatus: vi.fn(),
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

vi.mock("@/composition/member-status-query", () => ({
  memberStatusQueryService: () => ({ findMemberStatus }),
}));

import { isOnboardingCompleted } from "@/app/onboarding/payment/success/actions";

describe("isOnboardingCompleted（Query Service 経由）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ userId: "clerk_1" });
  });

  it("入会が確定した会員は true", async () => {
    findMemberStatus.mockResolvedValue({
      onboardingCompleted: true,
      withdrawn: false,
    });

    expect(await isOnboardingCompleted()).toBe(true);
    expect(findMemberStatus).toHaveBeenCalledWith("clerk_1");
  });

  it("入会が確定していない会員は false", async () => {
    findMemberStatus.mockResolvedValue({
      onboardingCompleted: false,
      withdrawn: false,
    });

    expect(await isOnboardingCompleted()).toBe(false);
  });

  it("退会済みの会員は false", async () => {
    findMemberStatus.mockResolvedValue({
      onboardingCompleted: true,
      withdrawn: true,
    });

    expect(await isOnboardingCompleted()).toBe(false);
  });

  it("会員の行が無いときは false", async () => {
    findMemberStatus.mockResolvedValue(null);

    expect(await isOnboardingCompleted()).toBe(false);
  });

  it("未ログインのときは問い合わせずに false", async () => {
    requireAuth.mockResolvedValue({ userId: null });

    expect(await isOnboardingCompleted()).toBe(false);
    expect(findMemberStatus).not.toHaveBeenCalled();
  });
});
