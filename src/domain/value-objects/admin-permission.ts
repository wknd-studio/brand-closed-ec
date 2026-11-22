// 運営者の操作ごとに要る Clerk のカスタム権限キー（docs/domain/admin-rbac.md の権限マトリクスの1行 = 1権限キー）。
// どのロールがどの権限を持つかはコードに持たず Clerk を正にする。Clerk の設定が権限マトリクスどおりかは
// scripts/clerk-admin-rbac.ts の check で検査する
const REQUIRED_PERMISSION_KEYS = {
  suspendMember: "org:members:suspend",
  forceWithdrawMember: "org:members:force_withdraw",
  manageInvitationCodes: "org:invitation_codes:manage",
  viewMembers: "org:members:read",
  setMemberInvitationStatus: "org:members:set_invitation_status",
  manageProducts: "org:products:manage",
  viewOrders: "org:orders:read",
  cancelOrder: "org:orders:cancel",
  createInvoice: "org:invoices:create",
  cancelSettlement: "org:settlements:cancel",
  manageProcurement: "org:procurement:manage",
  recordReceiving: "org:receiving:record",
  manageShipment: "org:shipments:manage",
  recordDelivery: "org:deliveries:record",
  handleReturn: "org:returns:manage",
  postAnnouncement: "org:announcements:manage",
  manageStaff: "org:staff:manage",
} as const;

export type AdminOperation = keyof typeof REQUIRED_PERMISSION_KEYS;
export type AdminPermissionKey =
  (typeof REQUIRED_PERMISSION_KEYS)[AdminOperation];

export class AdminPermission {
  private constructor(readonly key: AdminPermissionKey) {}

  /** その操作に要る権限。未知の操作は権限を返さずに例外にする（fail closed） */
  static requiredFor(operation: AdminOperation): AdminPermission {
    if (!Object.hasOwn(REQUIRED_PERMISSION_KEYS, operation)) {
      throw new Error(`未知の運営者の操作: ${operation}`);
    }
    return new AdminPermission(REQUIRED_PERMISSION_KEYS[operation]);
  }

  static all(): AdminPermission[] {
    return Object.values(REQUIRED_PERMISSION_KEYS).map(
      (key) => new AdminPermission(key)
    );
  }
}
