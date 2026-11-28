import type { ReturnRequest } from "@/domain/entities/return-request";
import { ReturnConcurrentlyModifiedError } from "@/domain/errors/return-concurrently-modified-error";
import type { ReturnRepository } from "@/repositories/return-repository";
import type { AdminUserRepository } from "@/repositories/admin-user-repository";

export type ReviewReturnInput = {
  returnId: string;
  /** 確認した運営者の Clerk のユーザーID（セッションから取る） */
  adminClerkUserId: string;
  /** 運営メモ（admin_note）。空白だけならメモなしとして扱う */
  adminNote: string;
};

export type ReviewReturnDeps = {
  returnRepo: ReturnRepository;
  adminUserRepo: AdminUserRepository;
};

/**
 * 運営者による返品申請の確認（承認・却下）の共通の手順（approve-return・reject-return から使う）。
 * 顧客へのメールはここでは送らない（#389）
 */
export async function reviewReturn(
  input: ReviewReturnInput,
  deps: ReviewReturnDeps,
  decide: (returnRequest: ReturnRequest, now: Date) => ReturnRequest
): Promise<void> {
  const returnRequest = await deps.returnRepo.findById(input.returnId);
  if (!returnRequest) throw new Error("返品申請が見つかりません");
  // 誰が確認したかを reviewed_by_admin_user_id に残すため、admin_users の行が無い運営者には操作させない
  const adminUser = await deps.adminUserRepo.findByClerkUserId(
    input.adminClerkUserId
  );
  if (!adminUser) throw new Error("運営者が見つかりません");

  // requested でない申請は approve()・reject() が InvalidStatusTransitionError を投げる
  const reviewed = decide(returnRequest, new Date());
  // 読んでから保存するまでの間に顧客が取り消していれば、条件付き更新で何も書き換わらない。
  // 読み直してやり直さず、運営者に画面を読み込み直してもらう
  const saved = await deps.returnRepo.saveReview(reviewed, {
    adminUserId: adminUser.id,
    adminNote: input.adminNote.trim() || null,
  });
  if (!saved) throw new ReturnConcurrentlyModifiedError(input.returnId);
}
