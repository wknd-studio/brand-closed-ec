/**
 * 既存のClerkユーザー全員のSelf Service Delete（<UserProfile /> の「アカウントを削除」）を
 * 無効にする、一度だけ実行するスクリプト（GitHub issue #530）。
 * 新しく作られるユーザーは user.created のWebhook（src/use-cases/create-user.ts）で無効にするため、
 * このスクリプトはそれより前に作られたユーザーのためのもの。
 * 何度実行しても同じ結果になる。更新したあと、全員が無効になっていることを確かめて結果を出す。
 *
 * 実行:
 *   doppler run -c dev -- pnpm tsx scripts/disable-clerk-self-delete.ts
 *   doppler run -c stg -- pnpm tsx scripts/disable-clerk-self-delete.ts
 */
import { createClerkClient, type User } from "@clerk/nextjs/server";

const PAGE_SIZE = 100;

async function listAllUsers(
  clerk: ReturnType<typeof createClerkClient>
): Promise<User[]> {
  const users: User[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await clerk.users.getUserList({ limit: PAGE_SIZE, offset });
    users.push(...page.data);
    if (page.data.length < PAGE_SIZE) return users;
  }
}

async function main() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY が未設定です");
  const clerk = createClerkClient({ secretKey });

  const targets = (await listAllUsers(clerk)).filter(
    (u) => u.deleteSelfEnabled
  );
  for (const user of targets) {
    await clerk.users.updateUser(user.id, { deleteSelfEnabled: false });
    console.log(`無効にした: ${user.id}`);
  }

  const after = await listAllUsers(clerk);
  const remaining = after.filter((u) => u.deleteSelfEnabled);
  console.log(
    `更新 ${targets.length}人 / 全 ${after.length}人中 delete_self_enabled: true は ${remaining.length}人`
  );
  if (remaining.length > 0) {
    throw new Error(
      `無効になっていないユーザーがいます: ${remaining.map((u) => u.id).join(", ")}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
