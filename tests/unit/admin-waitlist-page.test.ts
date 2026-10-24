import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  INVITATION_FETCH_LIMIT,
  WAITLIST_PAGE_SIZE,
  loadWaitlistPage,
  parsePage,
  type WaitlistClerkClient,
} from "@/app/admin/waitlist/load-waitlist-page";

function entry(n: number) {
  return {
    id: `wle_${n}`,
    emailAddress: `user${n}@example.com`,
    createdAt: 1_700_000_000_000 + n,
  };
}

function createClerk() {
  const listEntries = vi.fn();
  const getInvitationList = vi.fn();
  const getUserList = vi.fn();
  const clerk = {
    waitlistEntries: { list: listEntries },
    invitations: { getInvitationList },
    users: { getUserList },
  } as unknown as WaitlistClerkClient;
  return { clerk, listEntries, getInvitationList, getUserList };
}

describe("parsePage", () => {
  it.each([
    [undefined, 1],
    ["1", 1],
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["abc", 1],
    ["2.5", 1],
    [["4", "5"], 4],
  ])("%j → %d", (raw, expected) => {
    expect(parsePage(raw)).toBe(expected);
  });
});

describe("loadWaitlistPage", () => {
  let mocks: ReturnType<typeof createClerk>;

  beforeEach(() => {
    mocks = createClerk();
    mocks.getInvitationList.mockResolvedValue({ data: [], totalCount: 0 });
    mocks.getUserList.mockResolvedValue({ data: [], totalCount: 0 });
  });

  describe("ページング", () => {
    it("ページ番号から offset を計算し、承認待ちだけを新しい順に1ページ分取得する", async () => {
      mocks.listEntries.mockResolvedValue({ data: [entry(1)], totalCount: 1 });

      await loadWaitlistPage(mocks.clerk, 3);

      expect(mocks.listEntries).toHaveBeenCalledWith({
        status: "pending",
        limit: WAITLIST_PAGE_SIZE,
        offset: WAITLIST_PAGE_SIZE * 2,
        orderBy: "-created_at",
      });
    });

    it("総件数がページサイズちょうどなら1ページ", async () => {
      mocks.listEntries.mockResolvedValue({
        data: [entry(1)],
        totalCount: WAITLIST_PAGE_SIZE,
      });

      const result = await loadWaitlistPage(mocks.clerk, 1);

      expect(result.totalPages).toBe(1);
    });

    it("総件数がページサイズを1件超えたら2ページ", async () => {
      mocks.listEntries.mockResolvedValue({
        data: [entry(1)],
        totalCount: WAITLIST_PAGE_SIZE + 1,
      });

      const result = await loadWaitlistPage(mocks.clerk, 1);

      expect(result.totalPages).toBe(2);
      expect(result.totalCount).toBe(WAITLIST_PAGE_SIZE + 1);
    });

    it("0件でも1ページとして扱い、招待・ユーザーは問い合わせない", async () => {
      mocks.listEntries.mockResolvedValue({ data: [], totalCount: 0 });

      const result = await loadWaitlistPage(mocks.clerk, 1);

      expect(result).toEqual({
        entries: [],
        page: 1,
        totalPages: 1,
        totalCount: 0,
      });
      expect(mocks.getInvitationList).not.toHaveBeenCalled();
      expect(mocks.getUserList).not.toHaveBeenCalled();
    });
  });

  describe("状態の判定", () => {
    it("登録済み・招待済み・承認待ちを判定する（メールアドレスの大文字小文字は区別しない）", async () => {
      mocks.listEntries.mockResolvedValue({
        data: [entry(1), entry(2), entry(3)],
        totalCount: 3,
      });
      mocks.getUserList.mockResolvedValue({
        data: [{ emailAddresses: [{ emailAddress: "USER1@example.com" }] }],
        totalCount: 1,
      });
      mocks.getInvitationList.mockResolvedValue({
        data: [
          // 登録済みの人の招待が残っていても、登録済みを優先する
          { emailAddress: "user1@example.com" },
          { emailAddress: "user2@example.com" },
          // 部分一致しても別のアドレスは招待済みにしない
          { emailAddress: "user30@example.com" },
        ],
        totalCount: 3,
      });

      const result = await loadWaitlistPage(mocks.clerk, 1);

      expect(result.entries).toEqual([
        { ...entry(1), state: "registered" },
        { ...entry(2), state: "invited" },
        { ...entry(3), state: "pending" },
      ]);
    });
  });

  describe("Clerk APIの呼び出し回数", () => {
    it("行の数によらず、ユーザーはページ内のアドレスをまとめて1回で問い合わせる", async () => {
      const entries = Array.from({ length: WAITLIST_PAGE_SIZE }, (_, i) =>
        entry(i)
      );
      mocks.listEntries.mockResolvedValue({ data: entries, totalCount: 500 });

      await loadWaitlistPage(mocks.clerk, 1);

      expect(mocks.getUserList).toHaveBeenCalledTimes(1);
      expect(mocks.getUserList).toHaveBeenCalledWith({
        emailAddress: entries.map((e) => e.emailAddress),
        limit: WAITLIST_PAGE_SIZE,
      });
      expect(mocks.getInvitationList).toHaveBeenCalledTimes(1);
      expect(mocks.getInvitationList).toHaveBeenCalledWith({
        status: "pending",
        limit: INVITATION_FETCH_LIMIT,
        offset: 0,
      });
    });

    it("返信待ちの招待が取得上限を超える場合は、上限ごとに続きを取得する", async () => {
      mocks.listEntries.mockResolvedValue({ data: [entry(1)], totalCount: 1 });
      const total = INVITATION_FETCH_LIMIT + 1;
      mocks.getInvitationList
        .mockResolvedValueOnce({
          data: Array.from({ length: INVITATION_FETCH_LIMIT }, (_, i) => ({
            emailAddress: `other${i}@example.com`,
          })),
          totalCount: total,
        })
        .mockResolvedValueOnce({
          data: [{ emailAddress: "user1@example.com" }],
          totalCount: total,
        });

      const result = await loadWaitlistPage(mocks.clerk, 1);

      expect(mocks.getInvitationList).toHaveBeenCalledTimes(2);
      expect(mocks.getInvitationList).toHaveBeenLastCalledWith({
        status: "pending",
        limit: INVITATION_FETCH_LIMIT,
        offset: INVITATION_FETCH_LIMIT,
      });
      expect(result.entries[0].state).toBe("invited");
    });

    it("取得中に件数が減って空のページが返っても、無限ループしない", async () => {
      mocks.listEntries.mockResolvedValue({ data: [entry(1)], totalCount: 1 });
      mocks.getInvitationList.mockResolvedValue({ data: [], totalCount: 999 });

      await loadWaitlistPage(mocks.clerk, 1);

      expect(mocks.getInvitationList).toHaveBeenCalledTimes(1);
    });
  });
});
