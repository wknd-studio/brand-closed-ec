import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { AdminPermission } from "../src/domain/value-objects/admin-permission";

/**
 * 運営組織の Clerk のロール・権限を、docs/domain/admin-rbac.md の権限マトリクスどおりに作る・検査する（#390）。
 * ロールと「ロールごとの権限」はコードに持たず Clerk を正にするため、has() をモックしたユニットテストでは
 * 権限マトリクスどおりかを確かめられない。Clerk Backend API で実際の設定を読んで比べる。
 *
 * 実行（dev と stg は同じ Clerk の開発インスタンス。本番は -c prod）:
 *   doppler run -c dev -- pnpm tsx scripts/clerk-admin-rbac.ts setup   # 足りないものを作り、ロールの権限を表どおりに付け直す
 *   doppler run -c dev -- pnpm tsx scripts/clerk-admin-rbac.ts check   # ずれがあれば失敗する（task clerk:admin-rbac:check）
 */

export type AdminRbacMatrix = {
  /** 列の見出しのロールキー（左から順） */
  roles: string[];
  rows: { feature: string; permission: string; grantedTo: string[] }[];
};

export type ClerkAdminRole = { key: string; permissions: string[] };
export type ClerkRoleSet = { key: string; roles: string[] };

export const ADMIN_ROLE_SET_KEY = "role_set:operations";
const ADMIN_ORGANIZATION_NAME = "EQ×Mart 運営";
const MATRIX_HEADING = "## 権限マトリクス";
const DOC_PATH = "docs/domain/admin-rbac.md";

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function codeIn(cell: string): string | undefined {
  return cell.match(/`(org:[a-z0-9_:]+)`/)?.[1];
}

/** 「権限マトリクス」の節の最初の表を読む。列は「機能 | 権限キー | ロール…」。読めない形なら例外にする */
/** 「権限マトリクス」の節の最初の表の、セルに分けた行（見出し・区切り・本文） */
function matrixTable(markdown: string): string[][] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === MATRIX_HEADING);
  if (start < 0) {
    throw new Error(`「権限マトリクス」の節（${MATRIX_HEADING}）がありません`);
  }
  const headerIndex = lines.findIndex(
    (line, i) => i > start && line.trim().startsWith("|")
  );
  const tableLines: string[] = [];
  for (let i = headerIndex; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) break;
    tableLines.push(lines[i]);
  }
  return tableLines.map(cellsOf);
}

/** 「権限マトリクス」の節の最初の表を読む。列は「機能 | 権限キー | ロール…」。読めない形なら例外にする */
export function parseAdminRbacMatrix(markdown: string): AdminRbacMatrix {
  const [header, , ...body] = matrixTable(markdown);

  const roles = header.slice(2).map((cell) => {
    const key = codeIn(cell);
    if (!key)
      throw new Error(`ロールの列の見出しにロールキーがありません: ${cell}`);
    return key;
  });

  const seen = new Set<string>();
  const rows = body.map(([feature, permissionCell, ...cells]) => {
    const permission = codeIn(permissionCell);
    if (!permission) {
      throw new Error(`権限キーが書かれていない行があります: ${feature}`);
    }
    if (seen.has(permission)) {
      throw new Error(`権限キーが重複しています: ${permission}`);
    }
    seen.add(permission);
    const grantedTo = roles.filter((role, i) => {
      const cell = cells[i];
      if (cell !== "✅" && cell !== "—") {
        throw new Error(
          `${feature} の ${role} のセルが ✅・— 以外です: ${cell}`
        );
      }
      return cell === "✅";
    });
    return { feature, permission, grantedTo };
  });

  return { roles, rows };
}

function difference(a: Iterable<string>, b: Iterable<string>): string[] {
  const exclude = new Set(b);
  return [...a].filter((x) => !exclude.has(x)).sort();
}

/** Clerk の設定・src/domain の権限キー・権限マトリクスのずれを、人が読める文で返す。ずれが無ければ空 */
export function findAdminRbacDrift(input: {
  matrix: AdminRbacMatrix;
  domainPermissions: string[];
  clerkRoles: ClerkAdminRole[];
  otherRoleSets: ClerkRoleSet[];
}): string[] {
  const { matrix, domainPermissions, clerkRoles, otherRoleSets } = input;
  const problems: string[] = [];
  const matrixPermissions = matrix.rows.map((row) => row.permission);

  const notInDomain = difference(matrixPermissions, domainPermissions);
  if (notInDomain.length > 0) {
    problems.push(
      `権限マトリクスにあるが src/domain に無い権限キー: ${notInDomain.join(", ")}`
    );
  }
  const notInMatrix = difference(domainPermissions, matrixPermissions);
  if (notInMatrix.length > 0) {
    problems.push(
      `src/domain にあるが権限マトリクスに無い権限キー: ${notInMatrix.join(", ")}`
    );
  }

  const clerkRoleKeys = clerkRoles.map((role) => role.key);
  const unknownRoles = difference(clerkRoleKeys, matrix.roles);
  if (unknownRoles.length > 0) {
    problems.push(
      `運営組織の Role Set に権限マトリクスに無いロールがある（未知のロール）: ${unknownRoles.join(", ")}`
    );
  }
  const missingRoles = difference(matrix.roles, clerkRoleKeys);
  if (missingRoles.length > 0) {
    problems.push(
      `権限マトリクスのロールが運営組織の Role Set に無い: ${missingRoles.join(", ")}`
    );
  }

  for (const role of clerkRoles) {
    if (!matrix.roles.includes(role.key)) continue;
    const expected = matrix.rows
      .filter((row) => row.grantedTo.includes(role.key))
      .map((row) => row.permission);
    const missing = difference(expected, role.permissions);
    if (missing.length > 0) {
      problems.push(`${role.key} に権限が足りない: ${missing.join(", ")}`);
    }
    const extra = difference(role.permissions, expected);
    if (extra.length > 0) {
      problems.push(
        `${role.key} に権限マトリクスに無い権限が付いている: ${extra.join(", ")}`
      );
    }
  }

  for (const roleSet of otherRoleSets) {
    for (const role of roleSet.roles.filter((r) => matrix.roles.includes(r))) {
      problems.push(
        `運営者のロールが運営組織以外の Role Set にも入っている（顧客の組織で付けられてしまう）: ${roleSet.key} の ${role}`
      );
    }
  }

  return problems;
}

// ── 以下は Clerk Backend API を呼ぶ部分（手元で実行する。テストしない） ──

type ApiPermission = { id: string; key: string };
type ApiRole = { id: string; key: string; permissions: ApiPermission[] };
type ApiRoleSet = { key: string; roles: { key: string }[] };
type ApiOrganization = { id: string; role_set_key: string };

const API = "https://api.clerk.com/v1";
const PAGE_SIZE = 100;

async function clerkApi<T>(
  method: string,
  pathname: string,
  body?: unknown
): Promise<T> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY が未設定です");
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${pathname}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function listAll<T>(pathname: string): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await clerkApi<{ data: T[] }>(
      "GET",
      `${pathname}?limit=${PAGE_SIZE}&offset=${offset}`
    );
    items.push(...page.data);
    if (page.data.length < PAGE_SIZE) return items;
  }
}

function readMatrix(): AdminRbacMatrix {
  return parseAdminRbacMatrix(
    readFileSync(path.join(import.meta.dirname, "..", DOC_PATH), "utf8")
  );
}

function domainPermissions(): string[] {
  return AdminPermission.all().map((p) => p.key);
}

/** 表の見出し・機能の列から、Clerk に出す名前を作る（`**`・`[[ ]]`・`` ` `` を外す） */
function plainText(cell: string): string {
  return cell
    .replace(/\*\*/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/`/g, "")
    .replace(/（org:[a-z0-9_]+）/, "")
    .trim();
}

async function check(): Promise<string[]> {
  const organizationId = process.env.CLERK_ADMIN_ORGANIZATION_ID;
  if (!organizationId)
    throw new Error("CLERK_ADMIN_ORGANIZATION_ID が未設定です");

  const organization = await clerkApi<ApiOrganization>(
    "GET",
    `/organizations/${organizationId}`
  );
  const roleSets = await listAll<ApiRoleSet>("/role_sets");
  const adminRoleSet = roleSets.find(
    (set) => set.key === organization.role_set_key
  );
  if (!adminRoleSet) {
    throw new Error(
      `運営組織の Role Set が見つかりません: ${organization.role_set_key}`
    );
  }
  const roles = await listAll<ApiRole>("/organization_roles");
  const clerkRoles = adminRoleSet.roles.map(({ key }) => ({
    key,
    permissions: (
      roles.find((role) => role.key === key)?.permissions ?? []
    ).map((p) => p.key),
  }));

  const problems = findAdminRbacDrift({
    matrix: readMatrix(),
    domainPermissions: domainPermissions(),
    clerkRoles,
    otherRoleSets: roleSets
      .filter((set) => set.key !== adminRoleSet.key)
      .map((set) => ({ key: set.key, roles: set.roles.map((r) => r.key) })),
  });
  if (organization.role_set_key !== ADMIN_ROLE_SET_KEY) {
    problems.push(
      `運営組織の Role Set が ${ADMIN_ROLE_SET_KEY} でない: ${organization.role_set_key}`
    );
  }
  return problems;
}

async function setup(): Promise<void> {
  const matrix = readMatrix();
  const keyDrift = findAdminRbacDrift({
    matrix,
    domainPermissions: domainPermissions(),
    clerkRoles: [],
    otherRoleSets: [],
  }).filter((problem) => problem.includes("src/domain"));
  if (keyDrift.length > 0) throw new Error(keyDrift.join("\n"));

  // 1. カスタム権限（インスタンス全体で1つ）
  const permissionIds = new Map(
    (await listAll<ApiPermission>("/organization_permissions")).map((p) => [
      p.key,
      p.id,
    ])
  );
  for (const row of matrix.rows) {
    if (permissionIds.has(row.permission)) continue;
    const created = await clerkApi<ApiPermission>(
      "POST",
      "/organization_permissions",
      {
        name: plainText(row.feature),
        key: row.permission,
        description: `運営者の操作: ${plainText(row.feature)}（docs/domain/admin-rbac.md）`,
      }
    );
    permissionIds.set(created.key, created.id);
    console.log(`権限を作った: ${created.key}`);
  }

  // 2. ロールと、ロールごとの権限（表の ✅ と同じにする）
  const [header] = matrixTable(
    readFileSync(path.join(import.meta.dirname, "..", DOC_PATH), "utf8")
  );
  const roles = new Map(
    (await listAll<ApiRole>("/organization_roles")).map((r) => [r.key, r])
  );
  for (const [i, roleKey] of matrix.roles.entries()) {
    const expected = matrix.rows
      .filter((row) => row.grantedTo.includes(roleKey))
      .map((row) => row.permission);
    const role = roles.get(roleKey);
    if (!role) {
      await clerkApi("POST", "/organization_roles", {
        name: plainText(header[i + 2]),
        key: roleKey,
        description:
          "運営組織のロール（docs/domain/admin-rbac.md の権限マトリクス）",
        permissions: expected.map((key) => permissionIds.get(key)),
        include_in_initial_role_set: false,
      });
      console.log(`ロールを作った: ${roleKey}`);
      continue;
    }
    const current = role.permissions.map((p) => p.key);
    for (const key of difference(expected, current)) {
      await clerkApi(
        "POST",
        `/organization_roles/${role.id}/permissions/${permissionIds.get(key)}`
      );
      console.log(`${roleKey} に権限を付けた: ${key}`);
    }
    for (const permission of role.permissions) {
      if (expected.includes(permission.key)) continue;
      await clerkApi(
        "DELETE",
        `/organization_roles/${role.id}/permissions/${permission.id}`
      );
      console.log(`${roleKey} から権限を外した: ${permission.key}`);
    }
  }

  // 3. 運営組織専用の Role Set。新しいメンバーの既定のロールは、権限の一番少ないロールにする
  const roleSets = await listAll<ApiRoleSet>("/role_sets");
  const roleSet = roleSets.find((set) => set.key === ADMIN_ROLE_SET_KEY);
  const grantCount = (role: string) =>
    matrix.rows.filter((row) => row.grantedTo.includes(role)).length;
  const leastPrivileged = [...matrix.roles].sort(
    (a, b) => grantCount(a) - grantCount(b)
  )[0];
  if (!roleSet) {
    await clerkApi("POST", "/role_sets", {
      name: "運営組織",
      key: ADMIN_ROLE_SET_KEY,
      description: "運営組織専用のロール（docs/domain/admin-rbac.md）",
      type: "custom",
      roles: matrix.roles,
      default_role_key: leastPrivileged,
      creator_role_key: matrix.roles[0],
    });
    console.log(`Role Set を作った: ${ADMIN_ROLE_SET_KEY}`);
  } else {
    const missing = difference(
      matrix.roles,
      roleSet.roles.map((r) => r.key)
    );
    if (missing.length > 0) {
      await clerkApi("POST", `/role_sets/${ADMIN_ROLE_SET_KEY}/roles`, {
        role_keys: missing,
      });
      console.log(`Role Set にロールを足した: ${missing.join(", ")}`);
    }
  }

  // 4. 運営組織。メンバーのいる組織の Role Set を付け替えるとロールの対応付けが要るため、自動では変えない
  const organizationId = process.env.CLERK_ADMIN_ORGANIZATION_ID;
  if (organizationId) {
    const organization = await clerkApi<ApiOrganization>(
      "GET",
      `/organizations/${organizationId}`
    );
    if (organization.role_set_key !== ADMIN_ROLE_SET_KEY) {
      throw new Error(
        `運営組織の Role Set が ${organization.role_set_key} です。Clerk Dashboard で ${ADMIN_ROLE_SET_KEY} に変えてください`
      );
    }
  } else {
    // created_by を渡すとその人が作成者のロール（管理者）でメンバーになるため、渡さない
    const created = await clerkApi<ApiOrganization>("POST", "/organizations", {
      name: ADMIN_ORGANIZATION_NAME,
      role_set_key: ADMIN_ROLE_SET_KEY,
    });
    console.log(
      `運営組織を作った。Doppler の CLERK_ADMIN_ORGANIZATION_ID に入れる: ${created.id}`
    );
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "setup") {
    await setup();
    return;
  }
  if (command !== "check") {
    throw new Error(
      "使い方: pnpm tsx scripts/clerk-admin-rbac.ts <setup|check>"
    );
  }
  const problems = await check();
  if (problems.length > 0) {
    console.error(
      "Clerk の運営組織の設定が権限マトリクス（docs/domain/admin-rbac.md）とずれています:"
    );
    for (const problem of problems) console.error(`- ${problem}`);
    console.error(
      "直すには: doppler run -- pnpm tsx scripts/clerk-admin-rbac.ts setup"
    );
    process.exit(1);
  }
  console.log("Clerk の運営組織の設定は権限マトリクスどおり");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
