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
import {
  createAddress,
  updateAddress,
  deleteAddress,
} from "@/app/(member)/settings/actions";

function setupAuth(userId: string | null = "clerk_user_1") {
  vi.mocked(auth).mockResolvedValue({ userId } as never);
}

// -----------------------------------------------
// createAddress
// -----------------------------------------------

function setupSupabaseForCreate({
  insertError = null,
  existingCount = 0,
}: { insertError?: unknown; existingCount?: number } = {}) {
  const mockInsert = vi.fn().mockResolvedValue({ error: insertError });

  // count用: .select().eq().eq() → { count }
  const mockCountEq2 = vi.fn().mockResolvedValue({ count: existingCount });
  const mockCountEq1 = vi.fn().mockReturnValue({ eq: mockCountEq2 });
  const mockCountSelect = vi.fn().mockReturnValue({ eq: mockCountEq1 });

  let fromCallCount = 0;
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // users取得
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "db_user_1" } }),
            }),
          }),
        };
      }
      if (fromCallCount === 2) {
        // 件数チェック
        return { select: mockCountSelect };
      }
      // insert
      return { insert: mockInsert };
    }),
  } as never);
  return { mockInsert };
}

// -----------------------------------------------
// updateAddress
// -----------------------------------------------

function setupSupabaseForUpdate(error: unknown = null) {
  const mockEq = vi.fn().mockResolvedValue({ error });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "db_user_1" } }),
        }),
      }),
      update: mockUpdate,
    }),
  } as never);
  return { mockUpdate, mockEq };
}

// -----------------------------------------------
// deleteAddress
// -----------------------------------------------

type DeleteSetup = {
  addressRow?: {
    id: string;
    type: "shipping" | "billing";
    is_default: boolean;
  } | null;
  deleteError?: unknown;
  promoteError?: unknown;
};

function setupSupabaseForDelete({
  addressRow = { id: "addr_1", type: "shipping", is_default: false },
  deleteError = null,
  promoteError = null,
}: DeleteSetup = {}) {
  const mockDeleteEq = vi.fn().mockResolvedValue({ error: deleteError });
  const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });
  const mockPromoteEq2 = vi.fn().mockResolvedValue({ error: promoteError });
  const mockPromoteEq1 = vi.fn().mockReturnValue({ eq: mockPromoteEq2 });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockPromoteEq1 });

  // 最新住所取得用
  const mockNeqLimit = vi.fn().mockResolvedValue({ data: [{ id: "addr_2" }] });
  const mockNeqOrder = vi.fn().mockReturnValue({ limit: mockNeqLimit });
  const mockNeq = vi.fn().mockReturnValue({ order: mockNeqOrder });
  const mockEqType = vi.fn().mockReturnValue({ neq: mockNeq });
  const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqType });

  let fromCallCount = 0;
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // users取得
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "db_user_1" } }),
            }),
          }),
        };
      }
      if (fromCallCount === 2) {
        // address取得
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: addressRow }),
            }),
          }),
        };
      }
      if (fromCallCount === 3) {
        // DELETE
        return { delete: mockDelete };
      }
      if (fromCallCount === 4) {
        // 昇格候補取得（is_defaultだった場合のみ）
        return {
          select: vi.fn().mockReturnValue({ eq: mockEqUser }),
        };
      }
      // 昇格UPDATE
      return { update: mockUpdate };
    }),
  } as never);

  return { mockDeleteEq, mockUpdate };
}

// -----------------------------------------------
// テスト
// -----------------------------------------------

describe("createAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    setupAuth(null);
    const result = await createAddress(new FormData());
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("正常ケース: addressが登録される", async () => {
    setupAuth();
    const { mockInsert } = setupSupabaseForCreate();
    const fd = new FormData();
    fd.set("type", "shipping");
    fd.set("recipient_last_name", "山田");
    fd.set("recipient_first_name", "太郎");
    fd.set("postal_code", "1500001");
    fd.set("prefecture", "東京都");
    fd.set("city", "渋谷区");
    fd.set("address_line1", "神南1-1-1");
    fd.set("phone_number", "09012345678");
    const result = await createAddress(fd);
    expect(result).toEqual({ success: true });
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it("同タイプの住所が0件の場合はis_default=trueで登録される", async () => {
    setupAuth();
    const { mockInsert } = setupSupabaseForCreate({ existingCount: 0 });
    const fd = new FormData();
    fd.set("type", "shipping");
    fd.set("recipient_last_name", "山田");
    fd.set("recipient_first_name", "太郎");
    fd.set("postal_code", "1500001");
    fd.set("prefecture", "東京都");
    fd.set("city", "渋谷区");
    fd.set("address_line1", "神南1-1-1");
    fd.set("phone_number", "09012345678");
    await createAddress(fd);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: true })
    );
  });

  it("同タイプの住所が既存の場合はis_default=falseで登録される", async () => {
    setupAuth();
    const { mockInsert } = setupSupabaseForCreate({ existingCount: 1 });
    const fd = new FormData();
    fd.set("type", "shipping");
    fd.set("recipient_last_name", "鈴木");
    fd.set("recipient_first_name", "花子");
    fd.set("postal_code", "1600022");
    fd.set("prefecture", "東京都");
    fd.set("city", "新宿区");
    fd.set("address_line1", "新宿1-1-1");
    fd.set("phone_number", "09087654321");
    await createAddress(fd);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: false })
    );
  });

  it("DB挿入に失敗した場合はエラーを返す", async () => {
    setupAuth();
    setupSupabaseForCreate({ insertError: { message: "DB error" } });
    const result = await createAddress(new FormData());
    expect(result).toEqual({ error: "住所の登録に失敗しました" });
  });
});

describe("updateAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    setupAuth(null);
    const result = await updateAddress("addr_1", new FormData());
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("正常ケース: addressが更新される", async () => {
    setupAuth();
    const { mockUpdate } = setupSupabaseForUpdate();
    const fd = new FormData();
    fd.set("recipient_last_name", "鈴木");
    fd.set("recipient_first_name", "花子");
    fd.set("postal_code", "1600022");
    fd.set("prefecture", "東京都");
    fd.set("city", "新宿区");
    fd.set("address_line1", "新宿1-1-1");
    fd.set("phone_number", "09087654321");
    const result = await updateAddress("addr_1", fd);
    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it("DB更新に失敗した場合はエラーを返す", async () => {
    setupAuth();
    setupSupabaseForUpdate({ message: "DB error" });
    const result = await updateAddress("addr_1", new FormData());
    expect(result).toEqual({ error: "住所の更新に失敗しました" });
  });
});

describe("deleteAddress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    setupAuth(null);
    const result = await deleteAddress("addr_1");
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("正常ケース: デフォルトでない住所を削除する", async () => {
    setupAuth();
    const { mockDeleteEq } = setupSupabaseForDelete({
      addressRow: { id: "addr_1", type: "shipping", is_default: false },
    });
    const result = await deleteAddress("addr_1");
    expect(result).toEqual({ success: true });
    expect(mockDeleteEq).toHaveBeenCalledWith("id", "addr_1");
  });

  it("デフォルト住所を削除してもデフォルトは昇格しない（案C）", async () => {
    setupAuth();
    const { mockDeleteEq, mockUpdate } = setupSupabaseForDelete({
      addressRow: { id: "addr_1", type: "shipping", is_default: true },
    });
    const result = await deleteAddress("addr_1");
    expect(result).toEqual({ success: true });
    expect(mockDeleteEq).toHaveBeenCalledWith("id", "addr_1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
