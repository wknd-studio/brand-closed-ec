import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getClerkUserIdByEmail(
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
  });

  if (!invitation.url) {
    throw new Error(`招待URLの発行に失敗しました: ${emailAddress}`);
  }

  return invitation.url;
}

export async function cleanupTestUser(emailAddress: string) {
  const clerk = await clerkClient();

  const clerkUserId = await getClerkUserIdByEmail(emailAddress);
  if (clerkUserId) {
    // 並行実行中の他テストが先に削除している場合があるため、ベストエフォートで削除する
    await clerk.users.deleteUser(clerkUserId).catch(() => {});
  }

  await revokePendingInvitationsForEmail(emailAddress);

  await supabaseAdmin().from("users").delete().eq("email", emailAddress);
}
