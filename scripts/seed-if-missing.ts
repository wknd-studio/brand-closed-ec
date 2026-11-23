/**
 * ワークツリーで task dev の入口を取るとき、そのスロットのDBにテストアカウント（scripts/seed-users.ts）が無ければ、
 * テストアカウントとシナリオのデータ（scripts/seed-scenarios.ts）を入れる（issue #726）。
 * 揃っていれば何もしない（手動確認で変えた注文等を、task dev のたびに入れ直さないため）。
 *
 * 実行: bash scripts/dev-run.sh seed（task dev から。with-worktree-db.sh でスロットのDBに接続する）
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/types/database.types";
import { seedScenarios } from "./seed-scenarios";
import { SEED_USERS, runSeedUsers, type SeedSupabase } from "./seed-users";

type Logger = Pick<Console, "log" | "error">;

// 管理者は users の行を持たない（Clerk の publicMetadata だけ）ため、会員の行で判定する
const MEMBER_EMAILS = SEED_USERS.filter((u) => u.role === "member").map(
  (u) => u.email
);

export async function seedIfMissing({
  supabase,
  seed,
  logger,
}: {
  supabase: SeedSupabase;
  seed: () => Promise<void>;
  logger: Logger;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from("users")
    .select("email")
    .in("email", MEMBER_EMAILS)
    .is("deleted_at", null)
    .eq("onboarding_completed", true);
  if (error) {
    throw new Error(`テストアカウントの確認に失敗: ${error.message}`);
  }

  const present = new Set(data.map((r) => r.email));
  if (MEMBER_EMAILS.every((email) => present.has(email))) {
    logger.log("テストアカウントは投入済みのため、シードを省略します");
    return false;
  }

  logger.log("テストアカウントが無いため、シードを投入します\n");
  await seed();
  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const env = process.env;
  const supabase = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  seedIfMissing({
    supabase,
    seed: async () => {
      await runSeedUsers(
        env,
        () => ({
          clerk: createClerkClient({ secretKey: env.CLERK_SECRET_KEY! }),
          supabase,
        }),
        console
      );
      await seedScenarios({ supabase, logger: console });
    },
    logger: console,
  }).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
