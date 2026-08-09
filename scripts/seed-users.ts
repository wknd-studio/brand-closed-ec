/**
 * Clerk + Supabaseに開発用ユーザーをシードする。
 * 各ランク1人ずつ + 管理者3人を、存在しなければClerk側も新規作成した上でSupabaseへupsertする
 * （べき等・何度実行しても同じ結果）。
 * Clerk/Sanityはlocal/stgで共用のため環境分岐は不要だが、Supabaseはlocal/stgで
 * プロジェクトが分かれているため、doppler configの切り替えで接続先を変える。
 * パスワードはメールアドレスと同一の文字列。
 *
 * 実行:
 *   task supabase:seed-users        （dev config → ローカルDB）
 *   doppler run -c stg -- pnpm tsx scripts/seed-users.ts  （stg config → stg Supabase）
 *
 * 投入するアカウント一覧: docs/seed-data.md
 */
import { createClerkClient, type User } from "@clerk/nextjs/server";
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

const SEED_USERS: SeedUserDef[] = [...RANK_SEED_USERS, ...ADMIN_SEED_USERS];

async function findOrCreateClerkUser(
  clerk: ReturnType<typeof createClerkClient>,
  def: SeedUserDef
): Promise<{ user: User; created: boolean }> {
  const existing = await clerk.users.getUserList({
    emailAddress: [def.email],
  });
  if (existing.data[0]) return { user: existing.data[0], created: false };

  const created = await clerk.users.createUser({
    emailAddress: [def.email],
    password: def.email,
    skipPasswordChecks: true,
    firstName: def.firstName,
    lastName: def.lastName,
    publicMetadata: def.isAdmin ? { role: "admin" } : {},
  });
  return { user: created, created: true };
}

async function main() {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  console.log(`接続先: ${url}\n`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  for (const def of SEED_USERS) {
    const { user: clerkUser, created } = await findOrCreateClerkUser(
      clerk,
      def
    );

    const { error } = await supabase.from("users").upsert(
      {
        clerk_user_id: clerkUser.id,
        email: def.email,
        first_name: def.firstName,
        last_name: def.lastName,
        rank: def.rank,
        onboarding_completed: true,
      },
      { onConflict: "clerk_user_id" }
    );

    const roleLabel = def.isAdmin ? "[admin]" : `[rank: ${def.rank}]`;
    const clerkNote = created ? "Clerk新規作成" : "Clerk既存";

    if (error) {
      console.error(
        `✗ ${roleLabel} ${def.email} Supabase upsert失敗:`,
        error.message
      );
      continue;
    }
    console.log(
      `✓ ${roleLabel} ${def.email} / password: ${def.email} (${clerkNote}, clerk_user_id: ${clerkUser.id})`
    );
  }

  console.log(`\n完了しました。投入したアカウント数: ${SEED_USERS.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
