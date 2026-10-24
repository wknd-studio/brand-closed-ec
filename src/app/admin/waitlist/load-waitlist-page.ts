import type { clerkClient } from "@clerk/nextjs/server";

export type WaitlistClerkClient = Awaited<ReturnType<typeof clerkClient>>;

// Clerkの一覧APIは件数を指定しないと既定の10件しか返さない(上限は500件)ため、
// 1ページの件数を明示してoffsetでページングする
export const WAITLIST_PAGE_SIZE = 50;
export const INVITATION_FETCH_LIMIT = 500;

// pending: 承認待ち / invited: 招待済み(返信待ち) / registered: 登録済み
export type WaitlistEntryState = "pending" | "invited" | "registered";

export type WaitlistEntryRow = {
  id: string;
  emailAddress: string;
  createdAt: number;
  state: WaitlistEntryState;
};

export type WaitlistPage = {
  entries: WaitlistEntryRow[];
  page: number;
  totalPages: number;
  totalCount: number;
};

export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

// 返信待ちの招待を上限件数ずつすべて取得する。招待の一覧APIはメールアドレスを
// 複数指定して絞れないため、行ごとに問い合わせず全件を取得して突き合わせる
async function fetchPendingInvitationEmails(clerk: WaitlistClerkClient) {
  const emails = new Set<string>();
  for (let offset = 0; ; offset += INVITATION_FETCH_LIMIT) {
    const { data, totalCount } = await clerk.invitations.getInvitationList({
      status: "pending",
      limit: INVITATION_FETCH_LIMIT,
      offset,
    });
    for (const inv of data) emails.add(inv.emailAddress.toLowerCase());
    if (data.length === 0 || offset + data.length >= totalCount) return emails;
  }
}

async function fetchRegisteredEmails(
  clerk: WaitlistClerkClient,
  emailAddresses: string[]
) {
  const { data: users } = await clerk.users.getUserList({
    emailAddress: emailAddresses,
    limit: WAITLIST_PAGE_SIZE,
  });
  return new Set(
    users.flatMap((u) =>
      u.emailAddresses.map((e) => e.emailAddress.toLowerCase())
    )
  );
}

// 承認はwaitlistEntries.invite()ではなく汎用の招待APIで行うため(actions.ts参照)、
// Clerkが管理するエントリのstatusは承認後・登録後も"pending"のまま残る。
// そのため表示側で、登録済みのユーザー・返信待ちの招待と突き合わせて状態を決める
export async function loadWaitlistPage(
  clerk: WaitlistClerkClient,
  page: number
): Promise<WaitlistPage> {
  const { data: waitlistEntries, totalCount } =
    await clerk.waitlistEntries.list({
      status: "pending",
      limit: WAITLIST_PAGE_SIZE,
      offset: (page - 1) * WAITLIST_PAGE_SIZE,
      orderBy: "-created_at",
    });
  const totalPages = Math.max(1, Math.ceil(totalCount / WAITLIST_PAGE_SIZE));
  if (waitlistEntries.length === 0)
    return { entries: [], page, totalPages, totalCount };

  const [registered, invited] = await Promise.all([
    fetchRegisteredEmails(
      clerk,
      waitlistEntries.map((e) => e.emailAddress)
    ),
    fetchPendingInvitationEmails(clerk),
  ]);

  const entries = waitlistEntries.map((entry): WaitlistEntryRow => {
    const email = entry.emailAddress.toLowerCase();
    return {
      id: entry.id,
      emailAddress: entry.emailAddress,
      createdAt: entry.createdAt,
      state: registered.has(email)
        ? "registered"
        : invited.has(email)
          ? "invited"
          : "pending",
    };
  });
  return { entries, page, totalPages, totalCount };
}
