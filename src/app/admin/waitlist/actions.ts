"use server";

import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/current-user";

type ActionResult = { error: string } | undefined;

async function requireAdmin(): Promise<{ error: string } | null> {
  const { sessionClaims } = await requireAuth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };
  return null;
}

// Clerkの4xx(重複招待・存在しないエントリ等)は管理者の操作に起因する想定内の失敗のため、
// Sentryには送らずメッセージだけ返す。それ以外(5xx・429・通信障害等)は送る。
// メールアドレスは個人情報のためextraに含めない
function reportUnexpected(
  err: unknown,
  action: string,
  extra?: Record<string, unknown>
) {
  if (isClerkAPIResponseError(err) && err.status < 500 && err.status !== 429)
    return;
  Sentry.captureException(err, { tags: { action }, extra });
  console.error(`[${action}] 予期しないエラー:`, err);
}

export async function approveWaitlistEntry(
  waitlistEntryId: string
): Promise<ActionResult> {
  const authError = await requireAdmin();
  if (authError) return authError;

  const clerk = await clerkClient();
  try {
    // 招待先のメールアドレスはクライアントから受け取らず、Waitlistのエントリから得る
    // (Waitlistに登録されていない任意のアドレスを招待できないようにするため)。
    // エントリを1件取得するAPIは無いため一覧をIDで絞り、queryは部分一致のため完全一致で絞る
    const { data: entries } = await clerk.waitlistEntries.list({
      query: waitlistEntryId,
      status: "pending",
    });
    const entry = entries.find((e) => e.id === waitlistEntryId);
    if (!entry) return { error: "参加希望が見つかりません" };

    // waitlistEntries.invite()はAccount Portal(*.accounts.dev、英語固定)にしか
    // リンクできない仕様のため使わない。redirectUrlを指定できる汎用の招待APIを使い、
    // 自前の/sign-upページ(ブランドデザイン・日本語)に招待リンクを向ける。
    // 相対パスだとClerk側が自ドメインへ解決できずAccount Portalにフォールバック
    // することを実機検証で確認したため、必ず絶対URLで渡す
    // (NEXT_PUBLIC_APP_URLの末尾スラッシュ有無どちらでも二重スラッシュにならないようにする)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, "");
    await clerk.invitations.createInvitation({
      emailAddress: entry.emailAddress,
      redirectUrl: `${appUrl}/sign-up`,
      templateSlug: "waitlist_invitation",
    });
  } catch (err: unknown) {
    reportUnexpected(err, "approveWaitlistEntry", { waitlistEntryId });
    const message = err instanceof Error ? err.message : "承認に失敗しました";
    return { error: message };
  }

  revalidatePath("/admin/waitlist");
}

export async function rejectWaitlistEntry(
  waitlistEntryId: string,
  emailAddress: string
): Promise<ActionResult> {
  const authError = await requireAdmin();
  if (authError) return authError;

  const clerk = await clerkClient();
  try {
    // 承認時に発行した未使用の招待が残っていると、却下後も招待リンクから登録できてしまう。
    // 取り消しを先に行い、失敗したら却下しない(却下済みのエントリは一覧から消え、
    // 取り消しをやり直す手段が無くなるため)。queryは部分一致のため完全一致で絞る
    const { data: invitations } = await clerk.invitations.getInvitationList({
      query: emailAddress,
      status: "pending",
      // 既定の件数(10件)だと部分一致の他の招待に押し出されて取り消し漏れが起き得るため上限まで取る
      limit: 500,
    });
    for (const inv of invitations) {
      if (inv.emailAddress !== emailAddress) continue;
      await clerk.invitations.revokeInvitation(inv.id);
    }
    await clerk.waitlistEntries.reject(waitlistEntryId);
  } catch (err: unknown) {
    reportUnexpected(err, "rejectWaitlistEntry", { waitlistEntryId });
    const message = err instanceof Error ? err.message : "却下に失敗しました";
    return { error: message };
  }

  revalidatePath("/admin/waitlist");
}
