import { requireAuth } from "@/lib/auth/current-user";

export type AdminPermissionDeniedReason =
  /** セッションが無い */
  | "unauthenticated"
  /** アクティブな組織が運営組織でない（組織がアクティブでない・法人会員の組織がアクティブ） */
  | "not_admin_organization"
  /** 運営組織のメンバーだが、運営のロールがその権限を持たない（ロールが無い・未知のロールを含む） */
  | "forbidden";

export class AdminPermissionDeniedError extends Error {
  constructor(readonly reason: AdminPermissionDeniedReason) {
    super(`運営者の権限がありません: ${reason}`);
    this.name = "AdminPermissionDeniedError";
  }
}

/**
 * 今のセッションが運営組織（CLERK_ADMIN_ORGANIZATION_ID）のメンバーとして運営組織をアクティブにしているかを確かめ、
 * Clerk の userId を返す。そうでなければ AdminPermissionDeniedError を投げる。
 * 運営のロールと権限はここでは見ない（Supabase に持つ。src/composition/admin-authorization.ts）。
 * Clerk の組織のロール（org:admin 等）も見ない
 */
export async function requireAdminOrganizationMember(): Promise<{
  userId: string;
}> {
  const adminOrganizationId = process.env.CLERK_ADMIN_ORGANIZATION_ID;
  if (!adminOrganizationId) {
    throw new Error("CLERK_ADMIN_ORGANIZATION_ID が未設定です");
  }

  const { userId, orgId } = await requireAuth();
  if (!userId) throw new AdminPermissionDeniedError("unauthenticated");
  if (orgId !== adminOrganizationId) {
    throw new AdminPermissionDeniedError("not_admin_organization");
  }
  return { userId };
}
