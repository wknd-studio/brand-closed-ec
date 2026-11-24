import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// 運営スタッフの権限判定（#390）。「運営組織のメンバーである（Clerk のセッション）」かつ
// 「Supabase の admin_role_assignments のロールがその権限を持つ」ときだけ許可されることを、実DBで確かめる

const ADMIN_ORG_ID = "org_test_admin_authorization";

// Clerk のセッションの代わり。テストごとに userId・アクティブな組織を変える
const session = vi.hoisted(() => ({
  userId: null as string | null,
  orgId: null as string | null,
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({ ...session })),
}));

import { requireAdminPermission } from "@/composition/admin-authorization";
import { AdminPermissionDeniedError } from "@/lib/auth/admin-organization";
import {
  AdminPermission,
  type AdminOperation,
} from "@/domain/value-objects/admin-permission";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const STAFF = {
  ops_admin: {
    id: "00000000-0000-0000-0000-0000003900a1",
    clerkUserId: "clerk_test_authz_ops_admin",
  },
  ops_billing: {
    id: "00000000-0000-0000-0000-0000003900a2",
    clerkUserId: "clerk_test_authz_ops_billing",
  },
  ops_procurement: {
    id: "00000000-0000-0000-0000-0000003900a3",
    clerkUserId: "clerk_test_authz_ops_procurement",
  },
} as const;
// 運営組織のメンバーだが、ロールを付与していない運営スタッフ
const UNASSIGNED = {
  id: "00000000-0000-0000-0000-0000003900a4",
  clerkUserId: "clerk_test_authz_unassigned",
};
const ALL_STAFF = [...Object.values(STAFF), UNASSIGNED];

async function cleanup() {
  const ids = ALL_STAFF.map((s) => s.id);
  await supabase
    .from("admin_role_assignments")
    .delete()
    .in("admin_user_id", ids);
  await supabase.from("admin_users").delete().in("id", ids);
}

beforeAll(async () => {
  process.env.CLERK_ADMIN_ORGANIZATION_ID = ADMIN_ORG_ID;
  await cleanup();
  const { error } = await supabase.from("admin_users").insert(
    ALL_STAFF.map((s) => ({
      id: s.id,
      clerk_user_id: s.clerkUserId,
      name: "運営 テスト",
      email: `${s.clerkUserId}@example.com`,
    }))
  );
  if (error) throw error;
  const { error: roleError } = await supabase
    .from("admin_role_assignments")
    .insert(
      Object.entries(STAFF).map(([role, s]) => ({
        admin_user_id: s.id,
        role,
      }))
    );
  if (roleError) throw roleError;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(() => {
  session.userId = null;
  session.orgId = null;
});

function signInAs(clerkUserId: string, orgId: string | null = ADMIN_ORG_ID) {
  session.userId = clerkUserId;
  session.orgId = orgId;
}

async function denialReason(operation: AdminOperation) {
  const error = await requireAdminPermission(
    AdminPermission.requiredFor(operation)
  ).catch((e) => e);
  expect(error).toBeInstanceOf(AdminPermissionDeniedError);
  return (error as AdminPermissionDeniedError).reason;
}

describe("requireAdminPermission（DB のロールによる判定）", () => {
  it.each<[keyof typeof STAFF, AdminOperation]>([
    ["ops_admin", "handleReturn"],
    ["ops_admin", "manageStaff"],
    ["ops_billing", "createInvoice"],
    ["ops_billing", "viewMembers"],
    ["ops_procurement", "manageProcurement"],
    ["ops_procurement", "viewOrders"],
  ])("%s は %s を許可される", async (role, operation) => {
    signInAs(STAFF[role].clerkUserId);

    await expect(
      requireAdminPermission(AdminPermission.requiredFor(operation))
    ).resolves.toEqual({ userId: STAFF[role].clerkUserId });
  });

  it.each<[keyof typeof STAFF, AdminOperation]>([
    ["ops_billing", "handleReturn"],
    ["ops_billing", "manageProcurement"],
    ["ops_procurement", "createInvoice"],
    ["ops_procurement", "viewMembers"],
  ])("%s は %s を拒否される", async (role, operation) => {
    signInAs(STAFF[role].clerkUserId);

    expect(await denialReason(operation)).toBe("forbidden");
  });

  it("運営組織のメンバーでも、DB にロールが無ければ拒否する", async () => {
    signInAs(UNASSIGNED.clerkUserId);

    expect(await denialReason("viewOrders")).toBe("forbidden");
  });

  it("DB に運営スタッフの行が無い人（運営組織のメンバーとして同期されていない）は拒否する", async () => {
    signInAs("clerk_test_authz_not_staff");

    expect(await denialReason("viewOrders")).toBe("forbidden");
  });

  it("DB で管理者のロールを持っていても、運営組織がアクティブでなければ拒否する", async () => {
    signInAs(STAFF.ops_admin.clerkUserId, null);

    expect(await denialReason("viewOrders")).toBe("not_admin_organization");
  });

  it("DB で管理者のロールを持っていても、法人会員の組織がアクティブなら拒否する", async () => {
    signInAs(STAFF.ops_admin.clerkUserId, "org_customer");

    expect(await denialReason("viewOrders")).toBe("not_admin_organization");
  });

  it("セッションが無ければ拒否する", async () => {
    expect(await denialReason("viewOrders")).toBe("unauthenticated");
  });
});
