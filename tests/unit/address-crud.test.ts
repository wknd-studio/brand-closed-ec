import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/use-cases/create-address", () => ({
  createAddress: vi.fn(),
}));

vi.mock("@/use-cases/update-address", () => ({
  updateAddress: vi.fn(),
}));

vi.mock("@/use-cases/delete-address", () => ({
  deleteAddress: vi.fn(),
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
import { createAddress } from "@/use-cases/create-address";
import { updateAddress } from "@/use-cases/update-address";
import { deleteAddress } from "@/use-cases/delete-address";
import {
  createAddressAction,
  updateAddressAction,
  deleteAddressAction,
} from "@/app/(member)/settings/actions";

describe("createAddressAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const result = await createAddressAction(new FormData());
    expect(result).toEqual({ error: "認証されていません" });
    expect(createAddress).not.toHaveBeenCalled();
  });

  it("UseCase呼び出し成功時は { success: true } を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(createAddress).mockResolvedValue(undefined);
    const result = await createAddressAction(new FormData());
    expect(result).toEqual({ success: true });
  });

  it("UseCase失敗時はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(createAddress).mockRejectedValue(new Error("失敗"));
    const result = await createAddressAction(new FormData());
    expect(result).toEqual({ error: "住所の登録に失敗しました" });
  });
});

describe("updateAddressAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const result = await updateAddressAction("addr_1", new FormData());
    expect(result).toEqual({ error: "認証されていません" });
    expect(updateAddress).not.toHaveBeenCalled();
  });

  it("UseCase呼び出し成功時は { success: true } を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(updateAddress).mockResolvedValue(undefined);
    const result = await updateAddressAction("addr_1", new FormData());
    expect(result).toEqual({ success: true });
  });

  it("UseCase失敗時はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(updateAddress).mockRejectedValue(new Error("失敗"));
    const result = await updateAddressAction("addr_1", new FormData());
    expect(result).toEqual({ error: "住所の更新に失敗しました" });
  });
});

describe("deleteAddressAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const result = await deleteAddressAction("addr_1");
    expect(result).toEqual({ error: "認証されていません" });
    expect(deleteAddress).not.toHaveBeenCalled();
  });

  it("UseCase呼び出し成功時は { success: true } を返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(deleteAddress).mockResolvedValue(undefined);
    const result = await deleteAddressAction("addr_1");
    expect(result).toEqual({ success: true });
  });

  it("UseCase失敗時はエラーを返す", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk_1" } as never);
    vi.mocked(deleteAddress).mockRejectedValue(new Error("失敗"));
    const result = await deleteAddressAction("addr_1");
    expect(result).toEqual({ error: "住所の削除に失敗しました" });
  });
});
