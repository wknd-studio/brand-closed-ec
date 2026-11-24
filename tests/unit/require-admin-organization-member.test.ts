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
  requireAdminOrganizationMember,
} from "@/lib/auth/admin-organization";

const ADMIN_ORG_ID = "org_admin";

function mockSession(session: {
  userId: string | null;
  orgId?: string | null;
  orgRole?: string | null;
}) {
  vi.mocked(auth).mockResolvedValue({
    userId: session.userId,
    orgId: session.orgId ?? null,
    orgRole: session.orgRole ?? null,
  } as never);
}

async function denialReason() {
  const error = await requireAdminOrganizationMember().catch((e) => e);
  expect(error).toBeInstanceOf(AdminPermissionDeniedError);
  return (error as AdminPermissionDeniedError).reason;
}

describe("requireAdminOrganizationMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_ADMIN_ORGANIZATION_ID", ADMIN_ORG_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("運営組織がアクティブなセッションは、Clerk のロールに関係なく運営組織のメンバーとして userId を返す", async () => {
    mockSession({
      userId: "user_1",
      orgId: ADMIN_ORG_ID,
      orgRole: "org:member",
    });

    await expect(requireAdminOrganizationMember()).resolves.toEqual({
      userId: "user_1",
    });
  });

  it("セッションが無い場合は拒否する", async () => {
    mockSession({ userId: null });

    expect(await denialReason()).toBe("unauthenticated");
  });

  it("組織がアクティブでない場合（運営組織に属さない人・個人会員）は拒否する", async () => {
    mockSession({ userId: "user_1" });

    expect(await denialReason()).toBe("not_admin_organization");
  });

  it("運営組織以外の組織（法人会員の組織）がアクティブな場合は、その組織の管理者でも拒否する", async () => {
    mockSession({
      userId: "user_1",
      orgId: "org_customer",
      orgRole: "org:admin",
    });

    expect(await denialReason()).toBe("not_admin_organization");
  });

  it("運営組織のIDが未設定なら、誰も許可せずに設定の誤りとして例外にする", async () => {
    vi.stubEnv("CLERK_ADMIN_ORGANIZATION_ID", "");
    mockSession({ userId: "user_1", orgId: "" });

    await expect(requireAdminOrganizationMember()).rejects.toThrow(
      "CLERK_ADMIN_ORGANIZATION_ID が未設定です"
    );
  });
});
