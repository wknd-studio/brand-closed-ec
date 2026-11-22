/**
 * Clerk + Supabaseに開発用ユーザーをシードする。
 * 各ランク1人ずつの個人会員 + standardの法人会員1人 + 管理者1人を、存在しなければClerk側も新規作成する。会員はオンボーディングを
 * 終えた状態のusersの行を、有効な行があれば更新し、無ければ作る（べき等・何度実行しても同じ結果）。
 * 管理者はClerkの publicMetadata.role = "admin" だけで、usersの行は持たない。
 * 1件でも失敗すれば、残りを続けたうえで終了コード1で終わる。
 * Clerk/Sanityはlocal/stgで共用のため環境分岐は不要だが、Supabaseはlocal/stgで
 * プロジェクトが分かれているため、doppler configの切り替えで接続先を変える。
 * パスワードは環境変数 SEED_USER_PASSWORD（Dopplerのdev・stgに同じ値）から読み、
 * 既存のアカウントも毎回その値に更新する。未設定ならClerk・Supabaseに接続せずに止まる。
 *
 * 実行:
 *   task supabase:seed-users        （dev config → ローカルDB）
 *   doppler run -c stg_deploy -- pnpm tsx scripts/seed-users.ts  （stg_deploy config → stg Supabase。SEED_USER_PASSWORD はデプロイ用の config にある）
 *
 * 投入するアカウント一覧: docs/seed-data.md
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClerkClient } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  RANK_ORDER,
  type MemberRankValue,
} from "../src/domain/value-objects/member-rank";
import type { Database } from "../src/types/database.types";

type SeedUserDef = {
  email: string;
  firstName: string;
  lastName: string;
} & (
  | {
      role: "member";
      rank: MemberRankValue;
      // 法人会員のときだけ持つ。無ければ個人会員
      corporate?: { companyName: string; invoiceRegistrationNumber: string };
    }
  | { role: "admin" }
);

const RANK_SEED_USERS: SeedUserDef[] = RANK_ORDER.map((rank) => ({
  email: `info+test_${rank}@wknd-studio.com`,
  firstName: rank[0].toUpperCase() + rank.slice(1),
  lastName: "テストユーザー",
  role: "member",
  rank,
}));

const CORPORATE_SEED_USER: SeedUserDef = {
  email: "info+test_corporate@wknd-studio.com",
  firstName: "Corporate",
  lastName: "テストユーザー",
  role: "member",
  rank: "standard",
  corporate: {
    companyName: "株式会社テスト",
    invoiceRegistrationNumber: "T1234567890123",
  },
};

const ADMIN_SEED_USER: SeedUserDef = {
  email: "info+test_admin1@wknd-studio.com",
  firstName: "管理者",
  lastName: "テスト1",
  role: "admin",
};

export const SEED_USERS: SeedUserDef[] = [
  ...RANK_SEED_USERS,
  CORPORATE_SEED_USER,
  ADMIN_SEED_USER,
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
      skipLegalChecks: boolean;
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

export type SeedSupabase = SupabaseClient<Database>;

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
    // インスタンスはLegal Consentが必須で、Backend APIから作るときは同意日時か省略の指定が要る（422になる）
    skipLegalChecks: true,
    firstName: def.firstName,
    lastName: def.lastName,
    publicMetadata: def.role === "admin" ? { role: "admin" } : {},
  });
  return { userId: created.id, created: true };
}

// オンボーディング（決済完了）を終えた状態にする列。何度実行しても同じ状態になるよう、
// 前回の値や user.created Webhook が作った行の値に関係なく全て上書きする
function onboardedMemberProfile(
  def: SeedUserDef & { role: "member" }
): Database["public"]["Tables"]["users"]["Update"] {
  return {
    email: def.email,
    first_name: def.firstName,
    last_name: def.lastName,
    phone_number: "09012345678",
    rank_code: def.rank,
    member_type: def.corporate ? "corporate" : "individual",
    company_name: def.corporate?.companyName ?? null,
    invoice_registration_number:
      def.corporate?.invoiceRegistrationNumber ?? null,
    onboarding_completed: true,
    billing_anchor_day: 1,
  };
}

// clerk_user_idの一意制約は`WHERE deleted_at IS NULL`の部分UNIQUEインデックスのため、
// upsert(onConflict)ではなく、有効な行を更新し、無ければ作成する
// （tests/e2e/helpers/onboarded-member-row.ts の ensureMemberRow と同じ）
async function ensureOnboardedMemberRow(
  supabase: SeedSupabase,
  clerkUserId: string,
  def: SeedUserDef & { role: "member" }
): Promise<void> {
  const profile = onboardedMemberProfile(def);

  const updateActiveRow = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from("users")
      .update(profile)
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(`usersの更新に失敗: ${error.message}`);
    return data.length > 0;
  };

  if (await updateActiveRow()) return;

  const { error } = await supabase
    .from("users")
    .insert({ ...profile, email: def.email, clerk_user_id: clerkUserId })
    .select("id")
    .single();
  if (!error) return;

  // Clerkでアカウントを作ると、user.created Webhookが更新してから作成するまでの間に
  // 有効な行を作ることがある。その行を更新する
  if (
    error.code === "23505" &&
    error.message.includes("users_clerk_user_id_active_idx") &&
    (await updateActiveRow())
  ) {
    return;
  }
  throw new Error(`usersの作成に失敗: ${error.message}`);
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
  let failures = 0;

  for (const def of SEED_USERS) {
    const roleLabel = def.role === "admin" ? "[admin]" : `[rank: ${def.rank}]`;
    try {
      const { userId, created } = await upsertClerkUser(clerk, def, password);
      if (def.role === "member") {
        await ensureOnboardedMemberRow(supabase, userId, def);
      }
      const clerkNote = created ? "Clerk新規作成" : "Clerk既存・更新";
      logger.log(
        `✓ ${roleLabel} ${def.email} (${clerkNote}, clerk_user_id: ${userId})`
      );
    } catch (e) {
      failures++;
      logger.error(
        `✗ ${roleLabel} ${def.email} 失敗:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  if (failures > 0) {
    throw new Error(
      `${SEED_USERS.length}件中${failures}件のアカウントのシードに失敗しました`
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
