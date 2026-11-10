import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseAdminUserRepository } from "@/infrastructure/supabase/supabase-admin-user-repository";
import { AdminUser } from "@/domain/entities/admin-user";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabase = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 指定したテーブルへのリクエストにだけ PostgREST のエラーを返すクライアント。
// 実DBでは text 列の SELECT を失敗させにくいため、ネットワーク層で失敗を差し込む
function clientFailingOn(table: string) {
  return createClient<Database>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.pathname === `/rest/v1/${table}`) {
            return new Response(
              JSON.stringify({
                code: "XX000",
                message: "injected failure",
                details: null,
                hint: null,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(input, init);
        },
      },
    }
  );
}

const ADMIN_USER_ID = "00000000-0000-0000-0000-0000000614a1";
const OTHER_ADMIN_USER_ID = "00000000-0000-0000-0000-0000000614a2";
const CLERK_ADMIN = "clerk_test_admin_user_repo";

function buildAdminUser(
  overrides: Partial<Parameters<typeof AdminUser.of>[0]> = {}
): AdminUser {
  return AdminUser.of({
    id: ADMIN_USER_ID,
    clerkUserId: CLERK_ADMIN,
    name: "運営 太郎",
    email: "admin-user-repo@example.com",
    createdAt: new Date(),
    ...overrides,
  });
}

async function cleanup() {
  await supabase
    .from("admin_users")
    .delete()
    .in("id", [ADMIN_USER_ID, OTHER_ADMIN_USER_ID]);
}

beforeEach(cleanup);
afterAll(cleanup);

describe("SupabaseAdminUserRepository", () => {
  const repo = new SupabaseAdminUserRepository(supabase);

  it("saveした運営者をfindByClerkUserIdで取得できる", async () => {
    await repo.save(buildAdminUser());

    expect(await repo.findByClerkUserId(CLERK_ADMIN)).toMatchObject({
      id: ADMIN_USER_ID,
      clerkUserId: CLERK_ADMIN,
      name: "運営 太郎",
      email: "admin-user-repo@example.com",
    });
  });

  it("同じIDでsaveすると名前・メールを更新する", async () => {
    await repo.save(buildAdminUser());
    await repo.save(
      buildAdminUser({ name: "運営 花子", email: "updated@example.com" })
    );

    expect(await repo.findByClerkUserId(CLERK_ADMIN)).toMatchObject({
      id: ADMIN_USER_ID,
      name: "運営 花子",
      email: "updated@example.com",
    });
  });

  it("存在しない運営者のfindByClerkUserIdはnullを返す", async () => {
    expect(await repo.findByClerkUserId(CLERK_ADMIN)).toBeNull();
  });

  // supabase-js は失敗しても例外を投げず error を返すため、捨てると書き込みの失敗が成功扱いに、
  // 読み取りの失敗が「見つからない」に化ける（#614）
  it("findByClerkUserIdは読み取りの失敗で例外を投げる", async () => {
    const failingRepo = new SupabaseAdminUserRepository(
      clientFailingOn("admin_users")
    );
    await expect(failingRepo.findByClerkUserId(CLERK_ADMIN)).rejects.toThrow(
      "injected failure"
    );
  });

  it("saveは制約違反（同じClerkユーザーIDの別の運営者がいる）で例外を投げる", async () => {
    await repo.save(buildAdminUser());

    await expect(
      repo.save(buildAdminUser({ id: OTHER_ADMIN_USER_ID }))
    ).rejects.toThrow(/duplicate key/);
    expect((await repo.findByClerkUserId(CLERK_ADMIN))?.id).toBe(ADMIN_USER_ID);
  });
});
