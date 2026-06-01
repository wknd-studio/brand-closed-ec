import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { setDefaultAddress } from "@/app/(member)/settings/actions";

function setupAuth(userId: string | null = "clerk_user_1") {
  vi.mocked(auth).mockResolvedValue({ userId } as never);
}

type SupabaseSetup = {
  userRow?: { id: string } | null;
  resetError?: unknown;
  setError?: unknown;
};

function setupSupabase({
  userRow = { id: "db_user_1" },
  resetError = null,
  setError = null,
}: SupabaseSetup = {}) {
  // リセット用: .update().eq().eq() → Promise
  const mockResetEq2 = vi.fn().mockResolvedValue({ error: resetError });
  const mockResetEq1 = vi.fn().mockReturnValue({ eq: mockResetEq2 });
  // set用: .update().eq() → Promise
  const mockSetEq = vi.fn().mockResolvedValue({ error: setError });

  const mockUpdate = vi
    .fn()
    .mockReturnValueOnce({ eq: mockResetEq1 })
    .mockReturnValueOnce({ eq: mockSetEq });

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

  return { mockUpdate, mockResetEq2, mockSetEq };
}

describe("setDefaultAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    setupAuth(null);
    const result = await setDefaultAddress("addr_1", "shipping");
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("ユーザーが見つからない場合はエラーを返す", async () => {
    setupAuth();
    setupSupabase({ userRow: null });
    const result = await setDefaultAddress("addr_1", "shipping");
    expect(result).toEqual({ error: "ユーザーが見つかりません" });
  });

  it("正常ケース: 同タイプのis_defaultをリセットしてから対象をtrueに設定する", async () => {
    setupAuth();
    const { mockUpdate, mockResetEq2, mockSetEq } = setupSupabase();

    const result = await setDefaultAddress("addr_1", "shipping");

    expect(result).toEqual({ success: true });
    // 1回目: 同タイプをリセット
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { is_default: false });
    expect(mockResetEq2).toHaveBeenCalled();
    // 2回目: 対象をtrue
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { is_default: true });
    expect(mockSetEq).toHaveBeenCalled();
  });

  it("リセット更新に失敗した場合はエラーを返す", async () => {
    setupAuth();
    setupSupabase({ resetError: { message: "DB error" } });
    const result = await setDefaultAddress("addr_1", "shipping");
    expect(result).toEqual({ error: "デフォルト住所の更新に失敗しました" });
  });

  it("set更新に失敗した場合はエラーを返す", async () => {
    setupAuth();
    setupSupabase({ setError: { message: "DB error" } });
    const result = await setDefaultAddress("addr_1", "billing");
    expect(result).toEqual({ error: "デフォルト住所の更新に失敗しました" });
  });
});
