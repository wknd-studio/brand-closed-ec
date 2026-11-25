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

type FakeRow = Record<string, unknown> & {
  id: string;
  clerk_user_id: string;
  deleted_at: string | null;
};
type FakeError = { code?: string; message: string };

// seed-users.ts が使う「有効な行を更新して、無ければ作る」の呼び出しだけを、メモリ上の行で再現する
function makeSupabase({
  rows = [],
  failEmails = [],
  webhookRaceEmails = [],
}: {
  rows?: FakeRow[];
  failEmails?: string[];
  // 更新してから作成するまでの間に、user.created Webhook が有効な行を作るアカウント
  webhookRaceEmails?: string[];
} = {}) {
  const failure = (row: Record<string, unknown>): FakeError | null =>
    failEmails.includes(row.email as string)
      ? { message: "write failed" }
      : null;

  // subscriptions は stripe_subscription_id の一意制約での upsert だけを再現する
  const subscriptions: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table === "subscriptions") {
      return {
        upsert: async (
          row: Record<string, unknown>,
          { onConflict }: { onConflict: string }
        ) => {
          const existing = subscriptions.find(
            (s) => s[onConflict] === row[onConflict]
          );
          if (existing) Object.assign(existing, row);
          else subscriptions.push({ ...row });
          return { error: null };
        },
      };
    }
    expect(table).toBe("users");
    return {
      update: (fields: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => ({
          is: (nullColumn: string, nullValue: null) => ({
            select: async () => {
              const error = failure(fields);
              if (error) return { data: null, error };
              const matched = rows.filter(
                (r) => r[column] === value && r[nullColumn] === nullValue
              );
              for (const r of matched) Object.assign(r, fields);
              return { data: matched.map((r) => ({ id: r.id })), error: null };
            },
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const error = failure(row);
            if (error) return { data: null, error };
            if (webhookRaceEmails.includes(row.email as string)) {
              rows.push({
                id: `row_webhook_${rows.length + 1}`,
                clerk_user_id: row.clerk_user_id as string,
                deleted_at: null,
                email: row.email,
                onboarding_completed: false,
              });
              return {
                data: null,
                error: {
                  code: "23505",
                  message:
                    'duplicate key value violates unique constraint "users_clerk_user_id_active_idx"',
                },
              };
            }
            const created = {
              id: `row_${rows.length + 1}`,
              deleted_at: null,
              ...row,
            } as FakeRow;
            rows.push(created);
            return { data: { id: created.id }, error: null };
          },
        }),
      }),
    };
  });
  return {
    supabase: { from } as unknown as SeedSupabase,
    rows,
    subscriptions,
  };
}

const MEMBER_SEED_USERS = SEED_USERS.filter((u) => u.role === "member");
const ADMIN_SEED_USERS = SEED_USERS.filter((u) => u.role === "admin");

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

  it("Clerk の規約同意（Legal Consent）が必須のインスタンスでも作れるよう、同意の確認を省略して作る", async () => {
    const clerk = makeClerk();
    const { supabase } = makeSupabase();

    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    for (const [params] of clerk.users.createUser.mock.calls) {
      expect(params.skipLegalChecks).toBe(true);
    }
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

  it("各ランクの個人会員7人の users の行を、オンボーディングを終えた状態で作る", async () => {
    const clerk = makeClerk([MEMBER_SEED_USERS[0].email]);
    const { supabase, rows } = makeSupabase();

    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    expect(rows).toHaveLength(MEMBER_SEED_USERS.length);
    const individualRows = rows.filter((r) => r.member_type === "individual");
    expect(rows[0]).toEqual(
      expect.objectContaining({
        clerk_user_id: `user_existing_${MEMBER_SEED_USERS[0].email}`,
        email: MEMBER_SEED_USERS[0].email,
        rank_code: "starter",
        member_type: "individual",
        onboarding_completed: true,
      })
    );
    expect(individualRows.map((r) => r.rank_code)).toEqual([
      "starter",
      "basic",
      "standard",
      "pro",
      "advanced",
      "premium",
      "enterprise",
    ]);
    expect(rows[0]).not.toHaveProperty("rank");
    for (const row of individualRows) {
      expect(row).toEqual(
        expect.objectContaining({
          company_name: null,
          invoice_registration_number: null,
        })
      );
    }
  });

  // GitHub issue #380: 解約済みでない subscriptions 行が無い入会済みの会員は利用停止になる
  it("会員ごとに、users の行に紐づく有効なサブスクリプションの行を1つだけ入れる（何度実行しても増やさない）", async () => {
    const clerk = makeClerk(SEED_USERS.map((u) => u.email));
    const { supabase, rows, subscriptions } = makeSupabase();

    for (let i = 0; i < 2; i++) {
      await seedUsers({
        clerk,
        supabase,
        password: PASSWORD,
        logger: makeLogger(),
      });
    }

    expect(subscriptions).toHaveLength(MEMBER_SEED_USERS.length);
    for (const row of rows) {
      expect(subscriptions.filter((s) => s.user_id === row.id)).toEqual([
        expect.objectContaining({
          status: "active",
          rank_code: row.rank_code,
        }),
      ]);
    }
  });

  it("standard の法人会員1人の行を、会社名・インボイス登録番号つきで作る", async () => {
    const { supabase, rows } = makeSupabase();

    await seedUsers({
      clerk: makeClerk(),
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    expect(rows.filter((r) => r.member_type === "corporate")).toEqual([
      expect.objectContaining({
        email: "info+test_corporate@wknd-studio.com",
        rank_code: "standard",
        onboarding_completed: true,
        company_name: expect.stringMatching(/\S/),
        invoice_registration_number: expect.stringMatching(/^T\d{13}$/),
      }),
    ]);
  });

  it("シードするのは、個人会員7人・法人会員1人・運営者1人だけ", () => {
    expect(SEED_USERS.map((u) => u.email)).toEqual([
      "info+test_starter@wknd-studio.com",
      "info+test_basic@wknd-studio.com",
      "info+test_standard@wknd-studio.com",
      "info+test_pro@wknd-studio.com",
      "info+test_advanced@wknd-studio.com",
      "info+test_premium@wknd-studio.com",
      "info+test_enterprise@wknd-studio.com",
      "info+test_corporate@wknd-studio.com",
      "info+test_admin1@wknd-studio.com",
    ]);
  });

  it("既存の有効な行は更新し、何度実行しても行を増やさない", async () => {
    const clerk = makeClerk(SEED_USERS.map((u) => u.email));
    const { supabase, rows } = makeSupabase({
      rows: [
        {
          id: "row_webhook",
          clerk_user_id: `user_existing_${MEMBER_SEED_USERS[1].email}`,
          deleted_at: null,
          email: MEMBER_SEED_USERS[1].email,
          rank_code: "starter",
          onboarding_completed: false,
        },
      ],
    });

    for (let i = 0; i < 2; i++) {
      await seedUsers({
        clerk,
        supabase,
        password: PASSWORD,
        logger: makeLogger(),
      });
    }

    expect(rows).toHaveLength(MEMBER_SEED_USERS.length);
    expect(rows.find((r) => r.id === "row_webhook")).toEqual(
      expect.objectContaining({
        rank_code: "basic",
        onboarding_completed: true,
      })
    );
  });

  it("作成の直前に user.created Webhook が行を作っていたら、その行を更新する", async () => {
    const [member] = MEMBER_SEED_USERS;
    const { supabase, rows } = makeSupabase({
      webhookRaceEmails: [member.email],
    });

    await seedUsers({
      clerk: makeClerk(),
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    const memberRows = rows.filter((r) => r.email === member.email);
    expect(memberRows).toEqual([
      expect.objectContaining({
        rank_code: member.rank,
        onboarding_completed: true,
      }),
    ]);
  });

  it("運営者は users の行を作らず、Clerk の publicMetadata.role を admin にするだけ", async () => {
    const clerk = makeClerk();
    const { supabase, rows } = makeSupabase();

    await seedUsers({
      clerk,
      supabase,
      password: PASSWORD,
      logger: makeLogger(),
    });

    expect(ADMIN_SEED_USERS).toHaveLength(1);
    const adminEmails = ADMIN_SEED_USERS.map((u) => u.email);
    expect(rows.filter((r) => adminEmails.includes(r.email as string))).toEqual(
      []
    );
    for (const def of ADMIN_SEED_USERS) {
      expect(clerk.users.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAddress: [def.email],
          publicMetadata: { role: "admin" },
        })
      );
    }
    for (const def of MEMBER_SEED_USERS) {
      expect(clerk.users.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAddress: [def.email],
          publicMetadata: {},
        })
      );
    }
  });

  it("Supabase への書き込みが1件でも失敗したら、残りを続けたうえでエラーにする", async () => {
    const logger = makeLogger();
    const { supabase, rows } = makeSupabase({
      failEmails: [MEMBER_SEED_USERS[0].email],
    });

    await expect(
      seedUsers({ clerk: makeClerk(), supabase, password: PASSWORD, logger })
    ).rejects.toThrow(/1件/);
    expect(rows).toHaveLength(MEMBER_SEED_USERS.length - 1);
    expect(allOutput(logger)).not.toContain("完了しました");
  });

  it("Clerk の操作が失敗したアカウントがあれば、残りを続けたうえでエラーにする", async () => {
    const clerk = makeClerk();
    clerk.users.createUser.mockRejectedValueOnce(new Error("clerk down"));
    const logger = makeLogger();
    const { supabase, rows } = makeSupabase();

    await expect(
      seedUsers({ clerk, supabase, password: PASSWORD, logger })
    ).rejects.toThrow(/1件/);
    expect(rows).toHaveLength(MEMBER_SEED_USERS.length - 1);
    expect(allOutput(logger)).toContain("clerk down");
  });

  it("出力にパスワードを出さない（作成・更新・Supabase の失敗のどの場合も）", async () => {
    const logger = makeLogger();
    const { supabase } = makeSupabase({ failEmails: [SEED_USERS[0].email] });

    await expect(
      seedUsers({
        clerk: makeClerk([SEED_USERS[0].email]),
        supabase,
        password: PASSWORD,
        logger,
      })
    ).rejects.toThrow();

    const output = allOutput(logger);
    expect(output).toContain(SEED_USERS[0].email);
    expect(output).toContain("write failed");
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

  it("シードに失敗したアカウントがあれば、エラーで終わる（終了コードを0にしない）", async () => {
    const { supabase } = makeSupabase({ failEmails: [SEED_USERS[0].email] });
    const connect = vi.fn(() => ({ clerk: makeClerk(), supabase }));

    await expect(
      runSeedUsers({ SEED_USER_PASSWORD: PASSWORD }, connect, makeLogger())
    ).rejects.toThrow(/1件/);
  });
});
