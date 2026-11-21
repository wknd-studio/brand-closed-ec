/**
 * Clerk + Supabaseに開発用ユーザーをシードする。
 * 各ランク1人ずつ + 管理者3人を、存在しなければClerk側も新規作成した上でSupabaseへupsertする
 * （べき等・何度実行しても同じ結果）。
 * Clerk/Sanityはlocal/stgで共用のため環境分岐は不要だが、Supabaseはlocal/stgで
 * プロジェクトが分かれているため、doppler configの切り替えで接続先を変える。
 * パスワードは環境変数 SEED_USER_PASSWORD（Dopplerのdev・stgに同じ値）から読み、
 * 既存のアカウントも毎回その値に更新する。未設定ならClerk・Supabaseに接続せずに止まる。
 *
 * 実行:
 *   task supabase:seed-users        （dev config → ローカルDB）
 *   doppler run -c stg -- pnpm tsx scripts/seed-users.ts  （stg config → stg Supabase）
 *
 * 投入するアカウント一覧: docs/seed-data.md
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import {
  RANK_ORDER,
  type MemberRankValue,
} from "../src/domain/value-objects/member-rank";

type SeedUserDef = {
  email: string;
  firstName: string;
  lastName: string;
  rank: MemberRankValue;
  isAdmin: boolean;
};

const RANK_SEED_USERS: SeedUserDef[] = RANK_ORDER.map((rank) => ({
  email: `info+test_${rank}@wknd-studio.com`,
  firstName: rank[0].toUpperCase() + rank.slice(1),
  lastName: "テストユーザー",
  rank,
  isAdmin: false,
}));

const ADMIN_SEED_USERS: SeedUserDef[] = [1, 2, 3].map((n) => ({
  email: `info+test_admin${n}@wknd-studio.com`,
  firstName: "管理者",
  lastName: `テスト${n}`,
  // 管理者はrankによる制御を受けないが、usersテーブルのrankはNOT NULLのため
  // 最上位ランクを仮に設定しておく
  rank: "enterprise" as const,
  isAdmin: true,
}));

export const SEED_USERS: SeedUserDef[] = [
  ...RANK_SEED_USERS,
  ...ADMIN_SEED_USERS,
];

// テストでモックに差し替えられるよう、使うメソッドだけに絞った型
export type SeedClerk = {
  users: {
    getUserList(params: {
      emailAddress: string[];
    }): Promise<{ data: { id: string }[] }>;
    createUser(params: {
      emailAddress: string[];
      password: string;
      skipPasswordChecks: boolean;
      firstName: string;
      lastName: string;
      publicMetadata: Record<string, unknown>;
    }): Promise<{ id: string }>;
    updateUser(
      userId: string,
      params: { password: string; skipPasswordChecks: boolean }
    ): Promise<{ id: string }>;
  };
};

export type SeedSupabase = {
  from(table: "users"): {
    upsert(
      row: {
        clerk_user_id: string;
        email: string;
        first_name: string;
        last_name: string;
        rank: MemberRankValue;
        onboarding_completed: boolean;
      },
      options: { onConflict: string }
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

type Env = Record<string, string | undefined>;
type Logger = Pick<Console, "log" | "error">;

export function readSeedUserPassword(env: Env): string {
  const password = env.SEED_USER_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_USER_PASSWORD が設定されていません。Doppler の dev・stg に設定してから実行してください（docs/seed-data.md）"
    );
  }
  return password;
}

async function upsertClerkUser(
  clerk: SeedClerk,
  def: SeedUserDef,
  password: string
): Promise<{ userId: string; created: boolean }> {
  const existing = await clerk.users.getUserList({
    emailAddress: [def.email],
  });
  if (existing.data[0]) {
    // 旧パスワード（= メールアドレス）が残らないよう、既存のアカウントも毎回上書きする
    await clerk.users.updateUser(existing.data[0].id, {
      password,
      skipPasswordChecks: true,
    });
    return { userId: existing.data[0].id, created: false };
  }

  const created = await clerk.users.createUser({
    emailAddress: [def.email],
    password,
    skipPasswordChecks: true,
    firstName: def.firstName,
    lastName: def.lastName,
    publicMetadata: def.isAdmin ? { role: "admin" } : {},
  });
  return { userId: created.id, created: true };
}

export async function seedUsers({
  clerk,
  supabase,
  password,
  logger,
}: {
  clerk: SeedClerk;
  supabase: SeedSupabase;
  password: string;
  logger: Logger;
}): Promise<void> {
  for (const def of SEED_USERS) {
    const { userId, created } = await upsertClerkUser(clerk, def, password);

    const { error } = await supabase.from("users").upsert(
      {
        clerk_user_id: userId,
        email: def.email,
        first_name: def.firstName,
        last_name: def.lastName,
        rank: def.rank,
        onboarding_completed: true,
      },
      { onConflict: "clerk_user_id" }
    );

    const roleLabel = def.isAdmin ? "[admin]" : `[rank: ${def.rank}]`;
    const clerkNote = created ? "Clerk新規作成" : "Clerk既存・更新";

    if (error) {
      logger.error(
        `✗ ${roleLabel} ${def.email} Supabase upsert失敗:`,
        error.message
      );
      continue;
    }
    logger.log(
      `✓ ${roleLabel} ${def.email} (${clerkNote}, clerk_user_id: ${userId})`
    );
  }

  logger.log(`\n完了しました。投入したアカウント数: ${SEED_USERS.length}`);
}

export async function runSeedUsers(
  env: Env,
  connect: (env: Env) => {
    clerk: SeedClerk;
    supabase: SeedSupabase;
  },
  logger: Logger
): Promise<void> {
  // 接続より先に読み、未設定ならアカウントを1つも作らずに止める
  const password = readSeedUserPassword(env);
  const { clerk, supabase } = connect(env);
  await seedUsers({ clerk, supabase, password, logger });
}

function connect(env: Env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL!;
  console.log(`接続先: ${url}\n`);
  return {
    clerk: createClerkClient({ secretKey: env.CLERK_SECRET_KEY! }),
    supabase: createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    }),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runSeedUsers(process.env, connect, console).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
