import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/use-cases/set-default-address", () => ({
  setDefaultAddress: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/supabase-user-repository", () => ({
  SupabaseUserRepository: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/supabase-address-repository", () => ({
  SupabaseAddressRepository: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { setDefaultAddress } from "@/use-cases/set-default-address";
import { setDefaultAddressAction } from "@/app/(member)/settings/actions";

describe("setDefaultAddressAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const result = await setDefaultAddressAction("addr_1", "shipping");
    expect(result).toEqual({ error: "認証されていません" });
    expect(setDefaultAddress).not.toHaveBeenCalled();
  });

  it("UseCase呼び出し成功時は { success: true } を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(setDefaultAddress).mockResolvedValue(undefined);
    const result = await setDefaultAddressAction("addr_1", "shipping");
    expect(result).toEqual({ success: true });
    expect(setDefaultAddress).toHaveBeenCalledWith(
      { clerkUserId: "clerk_1", addressId: "addr_1", type: "shipping" },
      expect.any(Object)
    );
  });

  it("UseCase失敗時はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(setDefaultAddress).mockRejectedValue(new Error("失敗"));
    const result = await setDefaultAddressAction("addr_1", "billing");
    expect(result).toEqual({ error: "デフォルト住所の更新に失敗しました" });
  });
});
