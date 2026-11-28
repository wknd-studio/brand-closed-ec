import { describe, it, expect, vi } from "vitest";
import { updateReturnAdminNote } from "@/use-cases/update-return-admin-note";
import type { ReturnRepository } from "@/repositories/return-repository";

// 返品申請の運営メモ（admin_note）の編集（#383）。状態を問わず書き換えられる

const RETURN_ID = "00000000-0000-0000-0000-000000000401";

function makeReturnRepo(updated: boolean): ReturnRepository {
  return {
    findByOrderId: vi.fn(),
    saveAll: vi.fn(),
    findById: vi.fn(),
    saveReview: vi.fn(),
    updateAdminNote: vi.fn().mockResolvedValue(updated),
  };
}

describe("updateReturnAdminNote", () => {
  it("前後の空白を除いたメモを保存する", async () => {
    const returnRepo = makeReturnRepo(true);

    await updateReturnAdminNote(
      { returnId: RETURN_ID, adminNote: "  返送ラベルを送付済み \n" },
      { returnRepo }
    );

    expect(returnRepo.updateAdminNote).toHaveBeenCalledWith(
      RETURN_ID,
      "返送ラベルを送付済み"
    );
  });

  it("空白だけのメモは、メモを消す（null）として保存する", async () => {
    const returnRepo = makeReturnRepo(true);

    await updateReturnAdminNote(
      { returnId: RETURN_ID, adminNote: "  " },
      { returnRepo }
    );

    expect(returnRepo.updateAdminNote).toHaveBeenCalledWith(RETURN_ID, null);
  });

  it("申請が見つからなければエラーを投げる", async () => {
    await expect(
      updateReturnAdminNote(
        { returnId: RETURN_ID, adminNote: "メモ" },
        { returnRepo: makeReturnRepo(false) }
      )
    ).rejects.toThrow("返品申請が見つかりません");
  });
});
