import { describe, it, expect, vi } from "vitest";

import {
  SEED_USERS,
  readSeedUserPassword,
  runSeedUsers,
  seedUsers,
  type SeedClerk,
  type SeedSupabase,
} from "../../scripts/seed-users";

const PASSWORD = "x7Q2-random-seed-password-for-test-9fKd";

function makeClerk(existingEmails: string[] = []): SeedClerk & {
  users: {
    getUserList: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
} {
  return {
    users: {
      getUserList: vi.fn(
        async ({ emailAddress }: { emailAddress: string[] }) =>
          existingEmails.includes(emailAddress[0])
            ? { data: [{ id: `user_existing_${emailAddress[0]}` }] }
            : { data: [] }
      ),
      createUser: vi.fn(
        async ({ emailAddress }: { emailAddress: string[] }) => ({
          id: `user_new_${emailAddress[0]}`,
        })
      ),
      updateUser: vi.fn(async (id: string) => ({ id })),
    },
  };
}

function makeSupabase(error: { message: string } | null = null) {
  const upsert = vi.fn(async () => ({ error }));
  const supabase: SeedSupabase = { from: vi.fn(() => ({ upsert })) };
  return { supabase, upsert };
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn() };
}

function allOutput(logger: ReturnType<typeof makeLogger>): string {
  return [...logger.log.mock.calls, ...logger.error.mock.calls]
    .flat()
    .map(String)
    .join("\n");
}

describe("readSeedUserPassword", () => {
  it("SEED_USER_PASSWORD の値を返す", () => {
    expect(readSeedUserPassword({ SEED_USER_PASSWORD: PASSWORD })).toBe(
      PASSWORD
    );
  });

  it("未設定ならエラーにする", () => {
    expect(() => readSeedUserPassword({})).toThrow(/SEED_USER_PASSWORD/);
  });

  it("空文字ならエラーにする", () => {
    expect(() => readSeedUserPassword({ SEED_USER_PASSWORD: "" })).toThrow(
      /SEED_USER_PASSWORD/
    );
  });
});

describe("seedUsers", () => {
  it("存在しないアカウントは、環境変数のパスワードで作る（メールアドレスをパスワードにしない）", async () => {
    const clerk = makeClerk();
    const { supabase } = makeSupabase();

    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    expect(clerk.users.createUser).toHaveBeenCalledTimes(SEED_USERS.length);
    for (const [params] of clerk.users.createUser.mock.calls) {
      expect(params.password).toBe(PASSWORD);
      expect(params.password).not.toBe(params.emailAddress[0]);
    }
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
  });

  it("既存のアカウントは、毎回パスワードを環境変数の値に更新する", async () => {
    const clerk = makeClerk(SEED_USERS.map((u) => u.email));
    const { supabase } = makeSupabase();

    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });
    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    expect(clerk.users.createUser).not.toHaveBeenCalled();
    expect(clerk.users.updateUser).toHaveBeenCalledTimes(SEED_USERS.length * 2);
    for (const def of SEED_USERS) {
      expect(clerk.users.updateUser).toHaveBeenCalledWith(
        `user_existing_${def.email}`,
        expect.objectContaining({ password: PASSWORD })
      );
    }
  });

  it("Supabase の users に各アカウントを upsert する", async () => {
    const clerk = makeClerk([SEED_USERS[0].email]);
    const { supabase, upsert } = makeSupabase();

    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(upsert).toHaveBeenCalledTimes(SEED_USERS.length);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        clerk_user_id: `user_existing_${SEED_USERS[0].email}`,
        email: SEED_USERS[0].email,
        rank: SEED_USERS[0].rank,
        onboarding_completed: true,
      }),
      { onConflict: "clerk_user_id" }
    );
  });

  it("出力にパスワードを出さない（作成・更新・Supabase の失敗のどの場合も）", async () => {
    const logger = makeLogger();
    const { supabase } = makeSupabase({ message: "upsert failed" });

    await seedUsers({
      clerk: makeClerk([SEED_USERS[0].email]),
      supabase,
      password: PASSWORD,
      logger,
    });

    const output = allOutput(logger);
    expect(output).toContain(SEED_USERS[0].email);
    expect(output).toContain("upsert failed");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toMatch(/password/i);
  });
});

describe("runSeedUsers", () => {
  it("SEED_USER_PASSWORD が未設定なら、Clerk・Supabase に接続せずエラーで止まる", async () => {
    const connect = vi.fn();

    await expect(runSeedUsers({}, connect, makeLogger())).rejects.toThrow(
      /SEED_USER_PASSWORD/
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it("設定されていれば、接続してそのパスワードでシードする", async () => {
    const clerk = makeClerk();
    const { supabase } = makeSupabase();
    const connect = vi.fn(() => ({ clerk, supabase }));

    await runSeedUsers({ SEED_USER_PASSWORD: PASSWORD }, connect, makeLogger());

    expect(connect).toHaveBeenCalledOnce();
    expect(clerk.users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: PASSWORD })
    );
  });
});
