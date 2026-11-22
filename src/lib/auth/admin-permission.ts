import { requireAuth } from "@/lib/auth/current-user";

export type AdminPermissionDeniedReason =
  /** セッションが無い */
  | "unauthenticated"
  /** アクティブな組織が運営組織でない（組織がアクティブでない・法人会員の組織がアクティブ） */
  | "not_admin_organization"
  /** 運営組織で、その権限を持たない（未知のロール・権限を付けていないロール・Clerk に無い権限キー） */
  | "forbidden";

export class AdminPermissionDeniedError extends Error {
  constructor(readonly reason: AdminPermissionDeniedReason) {
    super(`運営者の権限がありません: ${reason}`);
    this.name = "AdminPermissionDeniedError";
  }
}

// Clerk のカスタム権限の形式。org:sys_ のシステム権限は運営組織の全員に付くため、運営の操作の判定には使わせない
const CUSTOM_PERMISSION = /^org:(?!sys_)[a-z0-9_]+:[a-z0-9_]+$/;

/**
 * 今のセッションが、運営組織で permission の権限を持つかを確かめる（docs/domain/admin-rbac.md の「認可の判定」）。
 * 持たなければ AdminPermissionDeniedError を投げる。permission は AdminPermission.requiredFor() の key を渡す。
 * ロールと「ロールごとの権限」は Clerk が正のため、ロールは見ずに has({ permission }) だけで判定する
 */
export async function requireAdminPermission(
  permission: string
): Promise<{ userId: string }> {
  const adminOrganizationId = process.env.CLERK_ADMIN_ORGANIZATION_ID;
  if (!adminOrganizationId) {
    throw new Error("CLERK_ADMIN_ORGANIZATION_ID が未設定です");
  }

  const { userId, orgId, has } = await requireAuth();
  if (!userId) throw new AdminPermissionDeniedError("unauthenticated");
  if (orgId !== adminOrganizationId) {
    throw new AdminPermissionDeniedError("not_admin_organization");
  }
  if (!CUSTOM_PERMISSION.test(permission) || !has({ permission })) {
    throw new AdminPermissionDeniedError("forbidden");
  }
  return { userId };
}
