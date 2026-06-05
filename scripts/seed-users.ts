/**
 * Supabase ローカルDBに開発用ユーザーをシードする。
 * Clerkに存在するユーザーのみinsert対象とし、べき等（何度実行しても同じ結果）。
 * ローカルDBのURLとキーは `supabase status` から自動取得する。
 *
 * 実行: pnpm tsx scripts/seed-users.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { execSync } from "child_process";
import { createClerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const SEED_USERS = [{ email: "info+test_admin@wknd-studio.com" }] as const;

function getLocalSupabase(): { url: string; serviceKey: string } {
  const output = execSync("supabase status 2>/dev/null").toString();
  const urlMatch = output.match(/Project URL\s+│\s+(http:\/\/[^\s|]+)/);
  const keyMatch = output.match(/Secret\s+│\s+(sb_secret_\S+)/);
  if (!urlMatch || !keyMatch) {
    throw new Error(
      "supabase status からURLまたはキーを取得できませんでした。`supabase start` を実行してください。"
    );
  }
  return { url: urlMatch[1].trim(), serviceKey: keyMatch[1].trim() };
}

async function main() {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  const { url, serviceKey } = getLocalSupabase();
  console.log(`接続先: ${url}`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  for (const { email } of SEED_USERS) {
    const result = await clerk.users.getUserList({ emailAddress: [email] });
    const clerkUser = result.data[0];

    if (!clerkUser) {
      console.error(`✗ Clerkに見つかりません: ${email}`);
      continue;
    }

    const { error } = await supabase.from("users").upsert(
      {
        clerk_user_id: clerkUser.id,
        email,
        first_name: clerkUser.firstName ?? "",
        last_name: clerkUser.lastName ?? "",
        rank: "free",
        onboarding_completed: false,
      },
      { onConflict: "clerk_user_id" }
    );

    if (error) {
      console.error(`✗ Supabase insert失敗 (${email}):`, error.message);
    } else {
      console.log(`✓ ${email} (${clerkUser.id})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
