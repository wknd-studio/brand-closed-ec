import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getClerkUserIdByEmail(
  email: string
): Promise<string | undefined> {
  const clerk = await clerkClient();
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });
  return data[0]?.id;
}

async function revokePendingInvitationsForEmail(email: string) {
  const clerk = await clerkClient();
  const { data: pendingInvitations } =
    await clerk.invitations.getInvitationList({ status: "pending" });
  for (const invitation of pendingInvitations) {
    if (invitation.emailAddress !== email) continue;
    // 招待はメール送信完了などで先方状態が変わり取消不能(400)になることがあるため、
    // ベストエフォートで取消を試み、失敗してもクリーンアップ全体は継続する
    await clerk.invitations.revokeInvitation(invitation.id).catch(() => {});
  }
}

export async function createTestInvitation(emailAddress: string) {
  const clerk = await clerkClient();

  const existingUserId = await getClerkUserIdByEmail(emailAddress);
  if (existingUserId) {
    await clerk.users.deleteUser(existingUserId);
  }

  await revokePendingInvitationsForEmail(emailAddress);

  const invitation = await clerk.invitations.createInvitation({
    emailAddress,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/welcome`,
    ignoreExisting: true,
    notify: false, // テスト用招待のためメール送信を止める。invitation.url を直接使うので通知不要
  });

  if (!invitation.url) {
    throw new Error(`招待URLの発行に失敗しました: ${emailAddress}`);
  }

  return invitation.url;
}

export async function cleanupTestUser(emailAddress: string) {
  // ClerkのFAPI/Backend APIがこの実行環境で断続的に失敗することがあり、
  // ここで例外が伝播すると後続のSupabase側の削除が一切実行されず
  // テスト用会員行が削除されずに残り続けてしまう。Clerk側の後片付けは
  // ベストエフォートとし、Supabase側の削除は必ず実行する
  try {
    const clerk = await clerkClient();
    const clerkUserId = await getClerkUserIdByEmail(emailAddress);
    if (clerkUserId) {
      await clerk.users.deleteUser(clerkUserId).catch(() => {});
    }
    await revokePendingInvitationsForEmail(emailAddress);
  } catch {
    // ベストエフォート。Clerk側の後片付けに失敗してもSupabase側の削除は続行する
  }

  const supabase = supabaseAdmin();
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("email", emailAddress);

  // usersを直接削除しようとすると、テスト中に作成したaddresses/ordersが
  // user_idを参照しているため外部キー制約違反で失敗し、それに気づかないまま
  // usersの行が残り続けてしまう。参照している行を先に削除してから消す
  for (const user of users ?? []) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", user.id);
    for (const order of orders ?? []) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
    }
    await supabase.from("orders").delete().eq("user_id", user.id);
    await supabase.from("addresses").delete().eq("user_id", user.id);
  }

  await supabase.from("users").delete().eq("email", emailAddress);
}
