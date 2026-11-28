import type { ReturnRepository } from "@/repositories/return-repository";

export type UpdateReturnAdminNoteInput = {
  returnId: string;
  /** 運営メモ（admin_note）。空白だけならメモを消す */
  adminNote: string;
};

export type UpdateReturnAdminNoteDeps = {
  returnRepo: ReturnRepository;
};

/**
 * 運営者が返品申請の運営メモを編集する。返送の方法の段取り等を書くため、状態を問わず書き換えられる
 * （docs/domain/returns.md「返送の物流フロー」）
 */
export async function updateReturnAdminNote(
  input: UpdateReturnAdminNoteInput,
  deps: UpdateReturnAdminNoteDeps
): Promise<void> {
  const updated = await deps.returnRepo.updateAdminNote(
    input.returnId,
    input.adminNote.trim() || null
  );
  if (!updated) throw new Error("返品申請が見つかりません");
}
