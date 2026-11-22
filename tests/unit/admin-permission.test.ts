import { describe, it, expect } from "vitest";
import {
  AdminPermission,
  type AdminOperation,
} from "@/domain/value-objects/admin-permission";

describe("AdminPermission", () => {
  describe("requiredFor()", () => {
    it.each<[AdminOperation, string]>([
      ["suspendMember", "org:members:suspend"],
      ["forceWithdrawMember", "org:members:force_withdraw"],
      ["manageInvitationCodes", "org:invitation_codes:manage"],
      ["viewMembers", "org:members:read"],
      ["setMemberInvitationStatus", "org:members:set_invitation_status"],
      ["manageProducts", "org:products:manage"],
      ["viewOrders", "org:orders:read"],
      ["cancelOrder", "org:orders:cancel"],
      ["createInvoice", "org:invoices:create"],
      ["cancelSettlement", "org:settlements:cancel"],
      ["manageProcurement", "org:procurement:manage"],
      ["recordReceiving", "org:receiving:record"],
      ["manageShipment", "org:shipments:manage"],
      ["recordDelivery", "org:deliveries:record"],
      ["handleReturn", "org:returns:manage"],
      ["postAnnouncement", "org:announcements:manage"],
      ["manageStaff", "org:staff:manage"],
    ])("%s には %s が要る", (operation, key) => {
      expect(AdminPermission.requiredFor(operation).key).toBe(key);
    });

    it("未知の操作は権限を返さずに例外にする（fail closed）", () => {
      expect(() =>
        AdminPermission.requiredFor("unknownOperation" as AdminOperation)
      ).toThrow("未知の運営者の操作");
    });

    it("Object のプロパティ名（toString 等）も未知の操作として扱う", () => {
      expect(() =>
        AdminPermission.requiredFor("toString" as AdminOperation)
      ).toThrow("未知の運営者の操作");
    });
  });

  describe("all()", () => {
    it("権限キーを重複なく全て返す（権限マトリクスの1行 = 1権限キー）", () => {
      const keys = AdminPermission.all().map((p) => p.key);
      expect(keys).toHaveLength(17);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("全ての権限キーが Clerk のカスタム権限の形式（org:<対象>:<操作>・org:sys_ 以外）である", () => {
      for (const { key } of AdminPermission.all()) {
        expect(key).toMatch(/^org:[a-z0-9_]+:[a-z0-9_]+$/);
        expect(key.startsWith("org:sys_")).toBe(false);
      }
    });
  });
});
