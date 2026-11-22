import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import {
  AdminPermissionDeniedError,
  requireAdminPermission,
} from "@/lib/auth/admin-permission";

const ADMIN_ORG_ID = "org_admin";
const PERMISSION = "org:orders:cancel";

// has() は Clerk が今のセッションのアクティブな組織のロールから判定する。ここでは、
// 渡された権限キーのうち granted に含まれるものだけを持つセッションとして扱う
function mockSession(session: {
  userId: string | null;
  orgId?: string | null;
  orgRole?: string | null;
  granted?: string[];
}) {
  const has = vi.fn(({ permission }: { permission: string }) =>
    (session.granted ?? []).includes(permission)
  );
  vi.mocked(auth).mockResolvedValue({
    userId: session.userId,
    orgId: session.orgId ?? null,
    orgRole: session.orgRole ?? null,
    has,
  } as never);
  return has;
}

async function denialReason(permission = PERMISSION) {
  const error = await requireAdminPermission(permission).catch((e) => e);
  expect(error).toBeInstanceOf(AdminPermissionDeniedError);
  return (error as AdminPermissionDeniedError).reason;
}

describe("requireAdminPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_ADMIN_ORGANIZATION_ID", ADMIN_ORG_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("運営組織がアクティブで、その権限を持つセッションは許可し、userId を返す", async () => {
    const has = mockSession({
      userId: "user_1",
      orgId: ADMIN_ORG_ID,
      orgRole: "org:ops_admin",
      granted: [PERMISSION],
    });

    await expect(requireAdminPermission(PERMISSION)).resolves.toEqual({
      userId: "user_1",
    });
    expect(has).toHaveBeenCalledWith({ permission: PERMISSION });
  });

  it("セッションが無い場合は拒否する", async () => {
    mockSession({ userId: null });

    expect(await denialReason()).toBe("unauthenticated");
  });

  it("組織がアクティブでない場合は、権限を調べずに拒否する", async () => {
    const has = mockSession({ userId: "user_1", granted: [PERMISSION] });

    expect(await denialReason()).toBe("not_admin_organization");
    expect(has).not.toHaveBeenCalled();
  });

  it("運営組織以外の組織（法人会員の組織）がアクティブな場合は、その組織で権限を持っていても拒否する", async () => {
    const has = mockSession({
      userId: "user_1",
      orgId: "org_customer",
      orgRole: "org:admin",
      granted: [PERMISSION],
    });

    expect(await denialReason()).toBe("not_admin_organization");
    expect(has).not.toHaveBeenCalled();
  });

  it("運営組織で、その権限を持たないロールは拒否する", async () => {
    mockSession({
      userId: "user_1",
      orgId: ADMIN_ORG_ID,
      orgRole: "org:ops_procurement",
      granted: ["org:orders:read"],
    });

    expect(await denialReason()).toBe("forbidden");
  });

  it("未知のロール（Clerk で権限を付けていないロール）は拒否する", async () => {
    mockSession({
      userId: "user_1",
      orgId: ADMIN_ORG_ID,
      orgRole: "org:unknown_role",
    });

    expect(await denialReason()).toBe("forbidden");
  });

  it("未知の権限キー（Clerk に無い権限キー）は拒否する", async () => {
    mockSession({
      userId: "user_1",
      orgId: ADMIN_ORG_ID,
      orgRole: "org:ops_admin",
      granted: [PERMISSION],
    });

    expect(await denialReason("org:unknown:manage")).toBe("forbidden");
  });

  it.each([
    // 運営組織の全員に付く Clerk のシステム権限。運営の操作の判定に使うと、ロールに関係なく許可してしまう
    "org:sys_memberships:read",
    // カスタム権限の形式（org:<対象>:<操作>）でないもの
    "org:ops_admin",
    "",
  ])(
    "カスタム権限の形式でない権限キー（%s）は、セッションが持っていても拒否する",
    async (permission) => {
      const has = mockSession({
        userId: "user_1",
        orgId: ADMIN_ORG_ID,
        orgRole: "org:ops_admin",
        granted: [permission],
      });

      expect(await denialReason(permission)).toBe("forbidden");
      expect(has).not.toHaveBeenCalled();
    }
  );

  it("運営組織のIDが未設定なら、誰も許可せずに設定の誤りとして例外にする", async () => {
    vi.stubEnv("CLERK_ADMIN_ORGANIZATION_ID", "");
    mockSession({
      userId: "user_1",
      orgId: "",
      orgRole: "org:ops_admin",
      granted: [PERMISSION],
    });

    await expect(requireAdminPermission(PERMISSION)).rejects.toThrow(
      "CLERK_ADMIN_ORGANIZATION_ID が未設定です"
    );
  });
});
