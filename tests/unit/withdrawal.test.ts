import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";
import { deleteAccount } from "@/app/(member)/settings/actions";

function setupAuth(userId: string | null = "user_abc") {
  vi.mocked(auth).mockResolvedValue({ userId } as never);
}

function setupSupabase({
  userRow = { stripe_subscription_id: "sub_123", rank: "entry" },
  updateError = null,
}: {
  userRow?: { stripe_subscription_id: string | null; rank: string } | null;
  updateError?: unknown;
} = {}) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: userRow }),
        }),
      }),
      update: mockUpdate,
    }),
  } as never);
  return { mockUpdate };
}

function setupClerk() {
  const mockDeleteUser = vi.fn().mockResolvedValue({});
  vi.mocked(clerkClient).mockResolvedValue({
    users: { deleteUser: mockDeleteUser },
  } as never);
  return { mockDeleteUser };
}

function setupStripe(cancelError?: Error) {
  const mockCancel = vi.fn().mockImplementation(() => {
    if (cancelError) throw cancelError;
    return Promise.resolve({});
  });
  vi.mocked(getStripe).mockReturnValue({
    subscriptions: { cancel: mockCancel },
  } as never);
  return { mockCancel };
}

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証の場合は error を返す", async () => {
    setupAuth(null);
    const result = await deleteAccount();
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("有料会員: Supabase論理削除 → Stripe解約 → Clerk削除を順に実行する", async () => {
    setupAuth();
    const { mockUpdate } = setupSupabase();
    const { mockDeleteUser } = setupClerk();
    const { mockCancel } = setupStripe();

    const result = await deleteAccount();

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    );
    expect(mockCancel).toHaveBeenCalledWith("sub_123");
    expect(mockDeleteUser).toHaveBeenCalledWith("user_abc");
  });

  it("Freeランク会員: Stripe解約をスキップする", async () => {
    setupAuth();
    setupSupabase({ userRow: { stripe_subscription_id: null, rank: "free" } });
    setupClerk();
    const { mockCancel } = setupStripe();

    const result = await deleteAccount();

    expect(result).toEqual({ success: true });
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("Supabase更新失敗時は error を返し後続処理を実行しない", async () => {
    setupAuth();
    setupSupabase({ updateError: { message: "DB error" } });
    const { mockDeleteUser } = setupClerk();

    const result = await deleteAccount();

    expect(result).toEqual({ error: "退会処理に失敗しました" });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("Stripe解約失敗時もClerk削除は実行する", async () => {
    setupAuth();
    setupSupabase();
    const { mockDeleteUser } = setupClerk();
    setupStripe(new Error("Stripe error"));

    const result = await deleteAccount();

    expect(result).toEqual({ success: true });
    expect(mockDeleteUser).toHaveBeenCalledWith("user_abc");
  });
});
