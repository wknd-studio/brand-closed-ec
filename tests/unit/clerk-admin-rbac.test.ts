import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { AdminPermission } from "@/domain/value-objects/admin-permission";
import {
  findAdminRbacDrift,
  parseAdminRbacMatrix,
  type AdminRbacMatrix,
} from "../../scripts/clerk-admin-rbac";

const DOC = `
# 運営者権限管理

## 権限マトリクス

説明の文。

| 機能 | 権限キー | 管理者（\`org:ops_admin\`） | 調達担当（\`org:ops_procurement\`） |
| --- | --- | :-: | :-: |
| 注文一覧・詳細閲覧 | \`org:orders:read\` | ✅ | ✅ |
| **返品・返金の承認**（2026-09-14確定） | \`org:returns:manage\` | ✅ | — |

表の後の文。

## 他の節

| 機能 | 権限キー |
| --- | --- |
| 関係ない表 | \`org:other:read\` |
`;

describe("parseAdminRbacMatrix", () => {
  it("「権限マトリクス」の節の表から、ロールキーと行ごとの権限キー・許可されたロールを読む", () => {
    expect(parseAdminRbacMatrix(DOC)).toEqual({
      roles: ["org:ops_admin", "org:ops_procurement"],
      rows: [
        {
          feature: "注文一覧・詳細閲覧",
          permission: "org:orders:read",
          grantedTo: ["org:ops_admin", "org:ops_procurement"],
        },
        {
          feature: "**返品・返金の承認**（2026-09-14確定）",
          permission: "org:returns:manage",
          grantedTo: ["org:ops_admin"],
        },
      ],
    });
  });

  it("「権限マトリクス」の節が無ければ例外にする", () => {
    expect(() => parseAdminRbacMatrix("# 見出しだけ\n")).toThrow(
      "「権限マトリクス」の節"
    );
  });

  it("ロールの列の見出しにロールキーが無ければ例外にする", () => {
    const doc = DOC.replace("管理者（`org:ops_admin`）", "管理者");
    expect(() => parseAdminRbacMatrix(doc)).toThrow("ロールキー");
  });

  it("権限キーが書かれていない行があれば例外にする", () => {
    const doc = DOC.replace("`org:orders:read`", "未定");
    expect(() => parseAdminRbacMatrix(doc)).toThrow("権限キー");
  });

  it("✅・— 以外のセルがあれば例外にする（読み違えて権限を付けないため）", () => {
    const doc = DOC.replace("| ✅ | — |", "| ✅ | △ |");
    expect(() => parseAdminRbacMatrix(doc)).toThrow("△");
  });

  it("「権限マトリクス」の節に表が無ければ、後ろの節の表を読まずに例外にする", () => {
    const doc = DOC.replace(/\| 機能 \| 権限キー \| 管理者[\s\S]*?\n\n/, "");
    expect(() => parseAdminRbacMatrix(doc)).toThrow(
      "「権限マトリクス」の節に表がありません"
    );
  });

  it("同じ権限キーの行が2つあれば例外にする（1行 = 1権限キー）", () => {
    const doc = DOC.replace("`org:returns:manage`", "`org:orders:read`");
    expect(() => parseAdminRbacMatrix(doc)).toThrow("重複");
  });
});

describe("findAdminRbacDrift", () => {
  const matrix: AdminRbacMatrix = parseAdminRbacMatrix(DOC);
  const domainPermissions = ["org:orders:read", "org:returns:manage"];
  const clerkRoles = [
    {
      key: "org:ops_admin",
      permissions: ["org:orders:read", "org:returns:manage"],
    },
    { key: "org:ops_procurement", permissions: ["org:orders:read"] },
  ];

  it("Clerk の設定・src/domain・権限マトリクスが一致すれば、ずれは無い", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions,
        clerkRoles,
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([]);
  });

  it("src/domain に無い権限キーが権限マトリクスにあれば、ずれとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions: ["org:orders:read"],
        clerkRoles,
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([
      "権限マトリクスにあるが src/domain に無い権限キー: org:returns:manage",
    ]);
  });

  it("権限マトリクスに無い権限キーが src/domain にあれば、ずれとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions: [...domainPermissions, "org:invoices:create"],
        clerkRoles,
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([
      "src/domain にあるが権限マトリクスに無い権限キー: org:invoices:create",
    ]);
  });

  it("運営組織の Role Set に権限マトリクスに無いロールがあれば、未知のロールとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions,
        clerkRoles: [
          ...clerkRoles,
          { key: "org:ops_unknown", permissions: ["org:orders:read"] },
        ],
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([
      "運営組織の Role Set に権限マトリクスに無いロールがある（未知のロール）: org:ops_unknown",
    ]);
  });

  it("権限マトリクスのロールが運営組織の Role Set に無ければ、ずれとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions,
        clerkRoles: [clerkRoles[0]],
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([
      "権限マトリクスのロールが運営組織の Role Set に無い: org:ops_procurement",
    ]);
  });

  it("ロールに足りない権限・余計な権限（システム権限を含む）があれば、ずれとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions,
        clerkRoles: [
          { key: "org:ops_admin", permissions: ["org:orders:read"] },
          {
            key: "org:ops_procurement",
            permissions: [
              "org:orders:read",
              "org:returns:manage",
              "org:sys_memberships:manage",
            ],
          },
        ],
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([
      "org:ops_admin に権限が足りない: org:returns:manage",
      "org:ops_procurement に権限マトリクスに無い権限が付いている: org:returns:manage, org:sys_memberships:manage",
    ]);
  });

  it("運営者のロールが他の Role Set（顧客の組織用）にも入っていれば、ずれとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions,
        clerkRoles,
        otherRoleSets: [
          {
            key: "role_set:default",
            roles: ["org:admin", "org:member", "org:ops_admin"],
          },
        ],
        otherRoles: [],
      })
    ).toEqual([
      "運営者のロールが運営組織以外の Role Set にも入っている（顧客の組織で付けられてしまう）: role_set:default の org:ops_admin",
    ]);
  });

  it("運営組織以外のロール（顧客の組織のロール）に運営の権限が付いていれば、ずれとして返す", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions,
        clerkRoles,
        otherRoleSets: [],
        otherRoles: [
          {
            key: "org:admin",
            permissions: ["org:sys_profile:manage", "org:returns:manage"],
          },
          { key: "org:member", permissions: ["org:sys_memberships:read"] },
        ],
      })
    ).toEqual([
      "運営組織以外のロールに運営の権限が付いている（顧客の組織で使えてしまう）: org:admin の org:returns:manage",
    ]);
  });
});

describe("docs/domain/admin-rbac.md の権限マトリクス", () => {
  const doc = readFileSync(
    path.join(__dirname, "../../docs/domain/admin-rbac.md"),
    "utf8"
  );
  const matrix = parseAdminRbacMatrix(doc);

  it("3ロールのロールキーが書かれている", () => {
    expect(matrix.roles).toEqual([
      "org:ops_admin",
      "org:ops_billing",
      "org:ops_procurement",
    ]);
  });

  it("権限キーが src/domain の権限キーと一致する", () => {
    expect(
      findAdminRbacDrift({
        matrix,
        domainPermissions: AdminPermission.all().map((p) => p.key),
        clerkRoles: matrix.roles.map((key) => ({
          key,
          permissions: matrix.rows
            .filter((row) => row.grantedTo.includes(key))
            .map((row) => row.permission),
        })),
        otherRoleSets: [],
        otherRoles: [],
      })
    ).toEqual([]);
  });
});
