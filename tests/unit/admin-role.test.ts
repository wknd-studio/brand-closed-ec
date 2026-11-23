import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import {
  AdminPermission,
  type AdminOperation,
} from "@/domain/value-objects/admin-permission";
import { AdminRole } from "@/domain/value-objects/admin-role";

const permission = (operation: AdminOperation) =>
  AdminPermission.requiredFor(operation);

describe("AdminRole", () => {
  describe("parse()", () => {
    it.each(["ops_admin", "ops_billing", "ops_procurement"])(
      "%s を運営のロールとして読む",
      (value) => {
        expect(AdminRole.parse(value)?.value).toBe(value);
      }
    );

    it.each([
      "unknown_role",
      // 顧客の組織（法人会員）のロールや Clerk のロールキーは、運営のロールではない
      "org:admin",
      "org:ops_admin",
      "",
    ])("未知のロール（%s）は読まない（fail closed）", (value) => {
      expect(AdminRole.parse(value)).toBeNull();
    });
  });

  describe("grants()", () => {
    it("管理者は全ての権限を持つ", () => {
      const admin = AdminRole.parse("ops_admin")!;
      for (const p of AdminPermission.all()) {
        expect(admin.grants(p)).toBe(true);
      }
    });

    it.each<[string, AdminOperation, boolean]>([
      ["ops_billing", "createInvoice", true],
      ["ops_billing", "viewMembers", true],
      ["ops_billing", "manageProcurement", false],
      ["ops_billing", "handleReturn", false],
      ["ops_procurement", "manageProcurement", true],
      ["ops_procurement", "viewOrders", true],
      ["ops_procurement", "createInvoice", false],
      ["ops_procurement", "viewMembers", false],
    ])("%s が %s できるかは %s", (role, operation, expected) => {
      expect(AdminRole.parse(role)!.grants(permission(operation))).toBe(
        expected
      );
    });

    it("返品・返金は管理者だけが持つ", () => {
      const holders = AdminRole.all()
        .filter((role) => role.grants(permission("handleReturn")))
        .map((role) => role.value);
      expect(holders).toEqual(["ops_admin"]);
    });
  });
});

// docs/domain/admin-rbac.md の権限マトリクス（人が読む表）が、コードの権限マトリクスと同じであること
describe("docs/domain/admin-rbac.md の権限マトリクス", () => {
  const doc = readFileSync(
    path.join(__dirname, "../../docs/domain/admin-rbac.md"),
    "utf8"
  );
  const lines = doc.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## 権限マトリクス");
  const table: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break;
    if (line.trim().startsWith("|")) {
      table.push(
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim())
      );
    } else if (table.length > 0) break;
  }
  const [header, , ...rows] = table;
  const roleColumns = header
    .slice(2)
    .map((cell) => cell.match(/`([a-z_]+)`/)?.[1]);
  const codeOf = (cell: string) => cell.match(/`([a-z0-9_:]+)`/)?.[1];

  it("列の見出しが3ロールのロールキーである", () => {
    expect(roleColumns).toEqual(AdminRole.all().map((role) => role.value));
  });

  it("権限キーの列が src/domain の権限キーと一致する", () => {
    expect(rows.map((row) => codeOf(row[1])).sort()).toEqual(
      AdminPermission.all()
        .map((p) => p.key)
        .sort()
    );
  });

  it("✅・— がコードのロールごとの権限と一致する", () => {
    for (const [, keyCell, ...cells] of rows) {
      const p = AdminPermission.all().find((x) => x.key === codeOf(keyCell))!;
      roleColumns.forEach((roleKey, i) => {
        expect(cells[i], `${p.key} の ${roleKey}`).toBe(
          AdminRole.parse(roleKey!)!.grants(p) ? "✅" : "—"
        );
      });
    }
  });
});
