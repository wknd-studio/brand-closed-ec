import type { UserRepository } from "@/repositories/user-repository";
import type { ErrorReporter } from "@/repositories/error-reporter";

export type DetectMemberDeletedWithoutWithdrawalInput = {
  clerkUserId: string;
  /** Clerk Webhook（svix）の配信ID。調査用に通知に添える */
  svixId: string;
};
export type DetectMemberDeletedWithoutWithdrawalDeps = {
  userRepo: UserRepository;
  errorReporter: ErrorReporter;
};

/**
 * Clerkアカウントの削除（user.deleted）を受けて、退会処理（withdraw.ts）を通らずに
 * 消えた会員がいないかを確かめる。いれば課金が続き会員も有効なまま残っているが、
 * 解約の判断は業務判断を伴うため自動で退会扱いにはせず、運営者に通知だけする（#531）
 */
export async function detectMemberDeletedWithoutWithdrawal(
  input: DetectMemberDeletedWithoutWithdrawalInput,
  deps: DetectMemberDeletedWithoutWithdrawalDeps
): Promise<void> {
  const user = await deps.userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) return;

  deps.errorReporter.captureMessage(
    "退会処理を通らずにClerkアカウントが削除されました。Stripeのサブスクを解約し、users.deleted_atを設定してください",
    {
      level: "error",
      tags: { webhook: "clerk", eventType: "user.deleted" },
      extra: {
        clerkUserId: input.clerkUserId,
        userId: user.id,
        svixId: input.svixId,
      },
    }
  );
}
