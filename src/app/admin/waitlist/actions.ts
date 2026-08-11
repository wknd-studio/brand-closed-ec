"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/current-user";

type ActionResult = { error: string } | undefined;

async function requireAdmin(): Promise<{ error: string } | null> {
  const { sessionClaims } = await requireAuth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };
  return null;
}

export async function approveWaitlistEntry(
  emailAddress: string
): Promise<ActionResult> {
  const authError = await requireAdmin();
  if (authError) return authError;

  const clerk = await clerkClient();
  try {
    // waitlistEntries.invite()はAccount Portal(*.accounts.dev、英語固定)にしか
    // リンクできない仕様のため使わない。redirectUrlを指定できる汎用の招待APIを使い、
    // 自前の/sign-upページ(ブランドデザイン・日本語)に招待リンクを向ける。
    // 相対パスだとClerk側が自ドメインへ解決できずAccount Portalにフォールバック
    // することを実機検証で確認したため、必ず絶対URLで渡す
    // (NEXT_PUBLIC_APP_URLの末尾スラッシュ有無どちらでも二重スラッシュにならないようにする)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "");
    await clerk.invitations.createInvitation({
      emailAddress,
      redirectUrl: `${appUrl}/sign-up`,
      templateSlug: "waitlist_invitation",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "承認に失敗しました";
    return { error: message };
  }

  revalidatePath("/admin/waitlist");
}

export async function rejectWaitlistEntry(
  waitlistEntryId: string
): Promise<ActionResult> {
  const authError = await requireAdmin();
  if (authError) return authError;

  const clerk = await clerkClient();
  try {
    await clerk.waitlistEntries.reject(waitlistEntryId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "却下に失敗しました";
    return { error: message };
  }

  revalidatePath("/admin/waitlist");
}
