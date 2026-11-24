import type {
  AdminPermission,
  AdminPermissionKey,
} from "@/domain/value-objects/admin-permission";

type AdminRoleValue = "ops_admin" | "ops_billing" | "ops_procurement";

const ROLES: readonly AdminRoleValue[] = [
  "ops_admin",
  "ops_billing",
  "ops_procurement",
];

// 権限マトリクス（ロール → 権限）の正。docs/domain/admin-rbac.md の表は人が読むための写しで、
// 一致することを tests/unit/admin-role.test.ts が確かめる。ロールの値は admin_role_assignments.role の CHECK と揃える
const GRANTED_ROLES: Record<AdminPermissionKey, readonly AdminRoleValue[]> = {
  "members:suspend": ["ops_admin"],
  "members:force_withdraw": ["ops_admin"],
  "invitation_codes:manage": ["ops_admin"],
  "members:read": ["ops_admin", "ops_billing"],
  "members:set_invitation_status": ["ops_admin"],
  "products:manage": ["ops_admin", "ops_procurement"],
  "orders:read": ["ops_admin", "ops_billing", "ops_procurement"],
  "orders:cancel": ["ops_admin", "ops_billing"],
  "invoices:create": ["ops_admin", "ops_billing"],
  "settlements:cancel": ["ops_admin", "ops_billing"],
  "procurement:manage": ["ops_admin", "ops_procurement"],
  "receiving:record": ["ops_admin", "ops_procurement"],
  "shipments:manage": ["ops_admin", "ops_procurement"],
  "deliveries:record": ["ops_admin", "ops_procurement"],
  "returns:manage": ["ops_admin"],
  "announcements:manage": ["ops_admin"],
  "staff:manage": ["ops_admin"],
};

/** 運営スタッフのロール（管理者・請求顧客担当・調達担当）。認証基盤（Clerk）のロールとは無関係 */
export class AdminRole {
  private constructor(readonly value: AdminRoleValue) {}

  /** 保存されたロールを読む。未知のロールは null（権限なし。fail closed） */
  static parse(value: string): AdminRole | null {
    return (ROLES as readonly string[]).includes(value)
      ? new AdminRole(value as AdminRoleValue)
      : null;
  }

  static all(): AdminRole[] {
    return ROLES.map((value) => new AdminRole(value));
  }

  grants(permission: AdminPermission): boolean {
    return GRANTED_ROLES[permission.key].includes(this.value);
  }
}
