import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseAdminMembershipRepository } from "@/infrastructure/supabase/supabase-admin-membership-repository";
import { AdminMembership } from "@/domain/entities/admin-membership";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ADMIN_USER_ID = "00000000-0000-0000-0000-0000000614b1";
// admin_users に存在しない運営者ID
const UNKNOWN_ADMIN_USER_ID = "00000000-0000-0000-0000-0000000614bf";
const MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000614c1";
const OTHER_MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000614c2";

function buildMembership(
  overrides: Partial<Parameters<typeof AdminMembership.of>[0]> = {}
): AdminMembership {
  return AdminMembership.of({
    id: MEMBERSHIP_ID,
    adminUserId: ADMIN_USER_ID,
    clerkRole: "org:admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

async function cleanupMemberships() {
  await supabase
    .from("admin_memberships")
    .delete()
    .in("admin_user_id", [ADMIN_USER_ID, UNKNOWN_ADMIN_USER_ID]);
}

beforeAll(async () => {
  await cleanupMemberships();
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
  const { error } = await supabase.from("admin_users").insert({
    id: ADMIN_USER_ID,
    clerk_user_id: "clerk_test_admin_membership_repo",
    name: "運営 太郎",
    email: "admin-membership-repo@example.com",
  });
  if (error) throw error;
});

beforeEach(cleanupMemberships);

afterAll(async () => {
  await cleanupMemberships();
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
});

describe("SupabaseAdminMembershipRepository", () => {
  const repo = new SupabaseAdminMembershipRepository(supabase);

  it("saveしたメンバーシップをfindByAdminUserIdで取得できる", async () => {
    await repo.save(buildMembership());

    expect(await repo.findByAdminUserId(ADMIN_USER_ID)).toMatchObject({
      id: MEMBERSHIP_ID,
      adminUserId: ADMIN_USER_ID,
      clerkRole: "org:admin",
    });
  });

  it("同じ運営者でsaveするとロールを更新する（運営者ごとに1件）", async () => {
    await repo.save(buildMembership());
    await repo.save(
      buildMembership({ id: OTHER_MEMBERSHIP_ID, clerkRole: "org:member" })
    );

    expect(await repo.findByAdminUserId(ADMIN_USER_ID)).toMatchObject({
      adminUserId: ADMIN_USER_ID,
      clerkRole: "org:member",
    });
  });

  it("deleteByAdminUserIdでその運営者のメンバーシップを削除する", async () => {
    await repo.save(buildMembership());

    await repo.deleteByAdminUserId(ADMIN_USER_ID);

    expect(await repo.findByAdminUserId(ADMIN_USER_ID)).toBeNull();
  });

  it("メンバーシップが無い運営者のfindByAdminUserIdはnullを返す", async () => {
    expect(await repo.findByAdminUserId(ADMIN_USER_ID)).toBeNull();
  });

  // supabase-js は失敗しても例外を投げず error を返すため、捨てると書き込みの失敗が成功扱いに、
  // 読み取りの失敗が「見つからない」に化ける（#614）
  it("findByAdminUserIdは読み取りの失敗（不正なUUID）で例外を投げる", async () => {
    await expect(repo.findByAdminUserId("not-a-uuid")).rejects.toThrow();
  });

  it("deleteByAdminUserIdは書き込みの失敗（不正なUUID）で例外を投げる", async () => {
    await expect(repo.deleteByAdminUserId("not-a-uuid")).rejects.toThrow();
  });

  it("saveは制約違反（存在しない運営者）で例外を投げる", async () => {
    await expect(
      repo.save(buildMembership({ adminUserId: UNKNOWN_ADMIN_USER_ID }))
    ).rejects.toThrow(/foreign key/);
  });
});
