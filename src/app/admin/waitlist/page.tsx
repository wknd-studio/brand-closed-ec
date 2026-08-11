import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { WaitlistTable } from "./waitlist-table";

// waitlistEntries.invite()を使わなくなったため、Clerkが自動更新するstatusは
// "pending"のままになる。承認済みかどうかは、同じメールアドレス宛の
// 有効(pending/accepted)な招待が存在するかで個別に判定する。
// 承認待ちの件数は運用上小さい前提のため、件数分の問い合わせで十分
async function isAlreadyInvited(
  clerk: Awaited<ReturnType<typeof clerkClient>>,
  emailAddress: string
) {
  const { data: invitations } = await clerk.invitations.getInvitationList({
    query: emailAddress,
  });
  return invitations.some(
    (inv) =>
      inv.emailAddress === emailAddress &&
      (inv.status === "pending" || inv.status === "accepted")
  );
}

export default async function WaitlistPage() {
  const clerk = await clerkClient();
  const { data: waitlistEntries } = await clerk.waitlistEntries.list({
    status: "pending",
  });

  const entries = await Promise.all(
    waitlistEntries.map(async (entry) => ({
      id: entry.id,
      emailAddress: entry.emailAddress,
      createdAt: entry.createdAt,
      alreadyInvited: await isAlreadyInvited(clerk, entry.emailAddress),
    }))
  );

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← 管理メニュー
      </Link>
      <h1 className="text-2xl font-semibold">Waitlist管理</h1>
      <WaitlistTable entries={entries} />
    </div>
  );
}
