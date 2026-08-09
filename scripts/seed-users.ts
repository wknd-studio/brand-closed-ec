/**
 * Supabaseに開発用ユーザーをシードする。
 * Clerkに存在するユーザーのみinsert対象とし、べき等（何度実行しても同じ結果）。
 * Clerk/Sanityはlocal/stgで共用のため環境分岐は不要だが、Supabaseはlocal/stgで
 * プロジェクトが分かれているため、doppler configの切り替えで接続先を変える。
 *
 * 実行:
 *   task supabase:seed-users        （dev config → ローカルDB）
 *   doppler run -c stg -- pnpm tsx scripts/seed-users.ts  （stg config → stg Supabase）
 */
import { createClerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const SEED_USERS = [{ email: "info+test_admin@wknd-studio.com" }] as const;

async function main() {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
        rank: "starter",
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
