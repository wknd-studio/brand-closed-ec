// 運営者の操作ごとに要る権限キー（docs/domain/admin-rbac.md の権限マトリクスの1行 = 1権限キー）。
// どのロールがどの権限を持つかは AdminRole（src/domain/value-objects/admin-role.ts）が持つ
const REQUIRED_PERMISSION_KEYS = {
  suspendMember: "members:suspend",
  forceWithdrawMember: "members:force_withdraw",
  manageInvitationCodes: "invitation_codes:manage",
  viewMembers: "members:read",
  setMemberInvitationStatus: "members:set_invitation_status",
  manageProducts: "products:manage",
  viewOrders: "orders:read",
  cancelOrder: "orders:cancel",
  createInvoice: "invoices:create",
  cancelSettlement: "settlements:cancel",
  manageProcurement: "procurement:manage",
  recordReceiving: "receiving:record",
  manageShipment: "shipments:manage",
  recordDelivery: "deliveries:record",
  handleReturn: "returns:manage",
  postAnnouncement: "announcements:manage",
  manageStaff: "staff:manage",
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
