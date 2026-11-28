"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/current-user";
import {
  approveReturn,
  rejectReturn,
  updateReturnAdminNote,
} from "@/composition/admin-return";
import { DomainError } from "@/domain/errors/domain-error";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";

export type ReturnReviewActionResult = { success: true } | { error: string };

// 今は publicMetadata.role === "admin" で判定する。管理者ロールだけに絞るのは #391 で権限判定に置き換えるとき
async function requireAdmin(): Promise<
  { error: string } | { adminClerkUserId: string }
> {
  const { userId, sessionClaims } = await requireAuth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (!userId || role !== "admin") return { error: "権限がありません" };
  return { adminClerkUserId: userId };
}

async function run(
  useCase: string,
  returnId: string,
  fallbackMessage: string,
  execute: () => Promise<void>
): Promise<ReturnReviewActionResult> {
  try {
    await execute();
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return {
        error:
          "申請中でない申請は承認・却下できません。画面を読み込み直してください",
      };
    }
    // 同時に変更された等の業務ルールの違反（DomainError）は想定内の失敗のため送らない
    if (err instanceof DomainError) return { error: err.message };
    Sentry.captureException(err, { tags: { useCase }, extra: { returnId } });
    return {
      error: err instanceof Error ? err.message : fallbackMessage,
    };
  }
  revalidatePath("/admin/returns");
  revalidatePath(`/admin/returns/${returnId}`);
  return { success: true };
}

export async function approveReturnAction(
  returnId: string,
  adminNote: string
): Promise<ReturnReviewActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  return run("approveReturn", returnId, "承認に失敗しました", () =>
    approveReturn({
      returnId,
      adminClerkUserId: admin.adminClerkUserId,
      adminNote,
    })
  );
}

export async function rejectReturnAction(
  returnId: string,
  adminNote: string
): Promise<ReturnReviewActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  return run("rejectReturn", returnId, "却下に失敗しました", () =>
    rejectReturn({
      returnId,
      adminClerkUserId: admin.adminClerkUserId,
      adminNote,
    })
  );
}

export async function updateReturnAdminNoteAction(
  returnId: string,
  adminNote: string
): Promise<ReturnReviewActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  return run(
    "updateReturnAdminNote",
    returnId,
    "メモの保存に失敗しました",
    () => updateReturnAdminNote({ returnId, adminNote })
  );
}
