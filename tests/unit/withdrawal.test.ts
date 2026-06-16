import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/use-cases/withdraw", () => ({
  withdraw: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));

vi.mock("@/infrastructure/stripe/stripe-subscription-gateway", () => ({
  StripeSubscriptionGateway: vi.fn(),
}));

vi.mock("@/infrastructure/clerk/clerk-account-gateway", () => ({
  ClerkAccountGateway: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

import { auth } from "@clerk/nextjs/server";
import { withdraw } from "@/use-cases/withdraw";
import { deleteAccount } from "@/app/(member)/settings/actions";

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証の場合は error を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const result = await deleteAccount();
    expect(result).toEqual({ error: "認証されていません" });
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("withdraw UseCase を呼び出し成功時は { success: true } を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_abc" } as never);
    vi.mocked(withdraw).mockResolvedValue(undefined);

    const result = await deleteAccount();
    expect(result).toEqual({ success: true });
    expect(withdraw).toHaveBeenCalledWith(
      { clerkUserId: "user_abc" },
      expect.any(Object)
    );
  });

  it("withdraw UseCase が失敗した場合は error を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_abc" } as never);
    vi.mocked(withdraw).mockRejectedValue(new Error("退会処理に失敗"));

    const result = await deleteAccount();
    expect(result).toEqual({ error: "退会処理に失敗しました" });
  });
});
