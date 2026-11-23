import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseAdminRoleQueryService } from "@/infrastructure/supabase/supabase-admin-role-query-service";
import type { AdminPermission } from "@/domain/value-objects/admin-permission";
import {
  AdminPermissionDeniedError,
  requireAdminOrganizationMember,
} from "@/lib/auth/admin-organization";

/**
 * 今のセッションが、運営組織のメンバー（Clerk）で、かつ運営のロール（Supabase の admin_role_assignments）が
 * permission を持つときだけ Clerk の userId を返す。どちらかが無ければ AdminPermissionDeniedError を投げる
 * （docs/domain/admin-rbac.md「認可の判定」）。admin の layout・page・Server Action から
 * src/composition/admin-authorization.ts 経由で呼ぶ
 */
export async function requireAdminPermission(
  permission: AdminPermission
): Promise<{ userId: string }> {
  const { userId } = await requireAdminOrganizationMember();
  // 運営者は users の行を持たないため admin で読む（architecture.md「admin クライアントを使ってよい場合」の 2）。
  // Clerk の userId はセッションから取ったもので、画面から送られた値ではない
  const role = await new SupabaseAdminRoleQueryService(
    createAdminClient()
  ).findRoleByClerkUserId(userId);
  if (!role?.grants(permission)) {
    throw new AdminPermissionDeniedError("forbidden");
  }
  return { userId };
}
