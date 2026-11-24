import { describe, it, expect } from "vitest";
import {
  AdminPermission,
  type AdminOperation,
} from "@/domain/value-objects/admin-permission";

describe("AdminPermission", () => {
  describe("requiredFor()", () => {
    it.each<[AdminOperation, string]>([
      ["suspendMember", "members:suspend"],
      ["forceWithdrawMember", "members:force_withdraw"],
      ["manageInvitationCodes", "invitation_codes:manage"],
      ["viewMembers", "members:read"],
      ["setMemberInvitationStatus", "members:set_invitation_status"],
      ["manageProducts", "products:manage"],
      ["viewOrders", "orders:read"],
      ["cancelOrder", "orders:cancel"],
      ["createInvoice", "invoices:create"],
      ["cancelSettlement", "settlements:cancel"],
      ["manageProcurement", "procurement:manage"],
      ["recordReceiving", "receiving:record"],
      ["manageShipment", "shipments:manage"],
      ["recordDelivery", "deliveries:record"],
      ["handleReturn", "returns:manage"],
      ["postAnnouncement", "announcements:manage"],
      ["manageStaff", "staff:manage"],
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

    it("全ての権限キーが <対象>:<操作> の形式で、認証基盤（Clerk）の形式に依存しない", () => {
      for (const { key } of AdminPermission.all()) {
        expect(key).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/);
      }
    });
  });
});
