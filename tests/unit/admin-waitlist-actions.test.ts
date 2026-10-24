import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  createInvitationMock,
  getInvitationListMock,
  revokeInvitationMock,
  rejectMock,
  listWaitlistEntriesMock,
  authMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  createInvitationMock: vi.fn(),
  getInvitationListMock: vi.fn(),
  revokeInvitationMock: vi.fn(),
  rejectMock: vi.fn(),
  listWaitlistEntriesMock: vi.fn(),
  authMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn().mockResolvedValue({
    invitations: {
      createInvitation: createInvitationMock,
      getInvitationList: getInvitationListMock,
      revokeInvitation: revokeInvitationMock,
    },
    waitlistEntries: {
      list: listWaitlistEntriesMock,
      reject: rejectMock,
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  captureException: captureExceptionMock,
}));

import { ClerkAPIResponseError } from "@clerk/nextjs/errors";
import {
  approveWaitlistEntry,
  rejectWaitlistEntry,
} from "@/app/admin/waitlist/actions";

describe("admin/waitlist actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
  });

  describe("権限チェック", () => {
    it("admin以外はapproveできない", async () => {
      authMock.mockResolvedValue({
        userId: "user_1",
        sessionClaims: { metadata: { role: "member" } },
      });

      const result = await approveWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "権限がありません" });
      expect(createInvitationMock).not.toHaveBeenCalled();
    });

    it("admin以外はrejectできない", async () => {
      authMock.mockResolvedValue({ userId: null, sessionClaims: null });

      const result = await rejectWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "権限がありません" });
      expect(rejectMock).not.toHaveBeenCalled();
    });
  });

  describe("admin操作", () => {
    beforeEach(() => {
      authMock.mockResolvedValue({
        userId: "user_admin",
        sessionClaims: { metadata: { role: "admin" } },
      });
      listWaitlistEntriesMock.mockResolvedValue({
        data: [
          {
            id: "wle_1",
            emailAddress: "a@example.com",
            status: "pending",
          },
        ],
      });
    });

    it("承認時はエントリIDでpendingのエントリを取得し、そのメールアドレスに招待を作成する", async () => {
      createInvitationMock.mockResolvedValue({ id: "inv_1" });

      await approveWaitlistEntry("wle_1");

      expect(listWaitlistEntriesMock).toHaveBeenCalledWith(
        expect.objectContaining({ query: "wle_1", status: "pending" })
      );
      expect(createInvitationMock).toHaveBeenCalledWith(
        expect.objectContaining({ emailAddress: "a@example.com" })
      );
    });

    it("存在しないエントリIDでは承認できない", async () => {
      // queryは部分一致のため、IDが完全一致しないエントリは対象外とする
      listWaitlistEntriesMock.mockResolvedValue({
        data: [
          {
            id: "wle_10",
            emailAddress: "b@example.com",
            status: "pending",
          },
        ],
      });

      const result = await approveWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "参加希望が見つかりません" });
      expect(createInvitationMock).not.toHaveBeenCalled();
    });

    it("pendingでないエントリは承認できない", async () => {
      // status: "pending"で絞った一覧に含まれない（却下済み・招待済み等）
      listWaitlistEntriesMock.mockResolvedValue({ data: [] });

      const result = await approveWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "参加希望が見つかりません" });
      expect(createInvitationMock).not.toHaveBeenCalled();
    });

    it("エントリの取得が想定外のエラーで失敗したら招待せずエラーを返しSentryに送る", async () => {
      const err = new Error("network error");
      listWaitlistEntriesMock.mockRejectedValue(err);

      const result = await approveWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "network error" });
      expect(createInvitationMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          tags: { action: "approveWaitlistEntry" },
          extra: { waitlistEntryId: "wle_1" },
        })
      );
    });

    it("承認時に絶対URLのredirectUrlとtemplateSlugを指定して招待を作成する", async () => {
      createInvitationMock.mockResolvedValue({ id: "inv_1" });

      const result = await approveWaitlistEntry("wle_1");

      expect(createInvitationMock).toHaveBeenCalledWith({
        emailAddress: "a@example.com",
        redirectUrl: "https://example.com/sign-up",
        templateSlug: "waitlist_invitation",
      });
      expect(result).toBeUndefined();
    });

    it("NEXT_PUBLIC_APP_URLの末尾スラッシュを除去し二重スラッシュにしない", async () => {
      const original = process.env.NEXT_PUBLIC_APP_URL;
      process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
      createInvitationMock.mockResolvedValue({ id: "inv_1" });

      await approveWaitlistEntry("wle_1");

      expect(createInvitationMock).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUrl: "https://example.com/sign-up" })
      );
      process.env.NEXT_PUBLIC_APP_URL = original;
    });

    it("招待作成が失敗したらエラーを返す", async () => {
      createInvitationMock.mockRejectedValue(new Error("already invited"));

      const result = await approveWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "already invited" });
    });

    it("招待作成がClerkの4xxで失敗したらSentryに送らない", async () => {
      createInvitationMock.mockRejectedValue(
        new ClerkAPIResponseError("duplicate", { data: [], status: 422 })
      );

      const result = await approveWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "duplicate" });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it("招待作成が想定外のエラーで失敗したらSentryに送る", async () => {
      const err = new ClerkAPIResponseError("server error", {
        data: [],
        status: 500,
      });
      createInvitationMock.mockRejectedValue(err);

      await approveWaitlistEntry("wle_1");

      expect(captureExceptionMock).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          tags: { action: "approveWaitlistEntry" },
        })
      );
    });

    it("Clerkのレート制限(429)はSentryに送る", async () => {
      createInvitationMock.mockRejectedValue(
        new ClerkAPIResponseError("too many requests", {
          data: [],
          status: 429,
        })
      );

      await approveWaitlistEntry("wle_1");

      expect(captureExceptionMock).toHaveBeenCalled();
    });

    it("却下時に同じメールアドレス宛のpendingの招待だけを取り消してから却下する", async () => {
      getInvitationListMock.mockResolvedValue({
        data: [
          { id: "inv_1", emailAddress: "a@example.com", status: "pending" },
          // queryは部分一致のため、別のアドレスも返り得る
          { id: "inv_2", emailAddress: "aa@example.com", status: "pending" },
        ],
      });
      rejectMock.mockResolvedValue({ id: "wle_1", status: "rejected" });

      const result = await rejectWaitlistEntry("wle_1");

      expect(getInvitationListMock).toHaveBeenCalledWith({
        query: "a@example.com",
        status: "pending",
        limit: 500,
      });
      expect(revokeInvitationMock).toHaveBeenCalledTimes(1);
      expect(revokeInvitationMock).toHaveBeenCalledWith("inv_1");
      expect(rejectMock).toHaveBeenCalledWith("wle_1");
      expect(revokeInvitationMock.mock.invocationCallOrder[0]).toBeLessThan(
        rejectMock.mock.invocationCallOrder[0]
      );
      expect(result).toBeUndefined();
    });

    it("却下時はエントリIDでpendingのエントリを取得し、そのメールアドレス宛ての招待だけを取り消す", async () => {
      getInvitationListMock.mockResolvedValue({
        data: [
          { id: "inv_1", emailAddress: "a@example.com", status: "pending" },
        ],
      });
      rejectMock.mockResolvedValue({ id: "wle_1", status: "rejected" });

      await rejectWaitlistEntry("wle_1");

      expect(listWaitlistEntriesMock).toHaveBeenCalledWith(
        expect.objectContaining({ query: "wle_1", status: "pending" })
      );
      expect(getInvitationListMock).toHaveBeenCalledWith(
        expect.objectContaining({ query: "a@example.com" })
      );
      expect(listWaitlistEntriesMock.mock.invocationCallOrder[0]).toBeLessThan(
        getInvitationListMock.mock.invocationCallOrder[0]
      );
    });

    it("存在しないエントリIDでは招待を取り消さず却下もしない", async () => {
      // queryは部分一致のため、IDが完全一致しないエントリは対象外とする
      listWaitlistEntriesMock.mockResolvedValue({
        data: [
          {
            id: "wle_10",
            emailAddress: "b@example.com",
            status: "pending",
          },
        ],
      });

      const result = await rejectWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "参加希望が見つかりません" });
      expect(getInvitationListMock).not.toHaveBeenCalled();
      expect(revokeInvitationMock).not.toHaveBeenCalled();
      expect(rejectMock).not.toHaveBeenCalled();
    });

    it("pendingでないエントリは招待を取り消さず却下もしない", async () => {
      listWaitlistEntriesMock.mockResolvedValue({ data: [] });

      const result = await rejectWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "参加希望が見つかりません" });
      expect(getInvitationListMock).not.toHaveBeenCalled();
      expect(revokeInvitationMock).not.toHaveBeenCalled();
      expect(rejectMock).not.toHaveBeenCalled();
    });

    it("却下時にエントリの取得が想定外のエラーで失敗したら招待を取り消さず却下もせずSentryに送る", async () => {
      const err = new Error("network error");
      listWaitlistEntriesMock.mockRejectedValue(err);

      const result = await rejectWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "network error" });
      expect(revokeInvitationMock).not.toHaveBeenCalled();
      expect(rejectMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).toHaveBeenCalledWith(
        err,
        expect.objectContaining({
          tags: { action: "rejectWaitlistEntry" },
          extra: { waitlistEntryId: "wle_1" },
        })
      );
    });

    it("招待が無い場合も却下できる", async () => {
      getInvitationListMock.mockResolvedValue({ data: [] });
      rejectMock.mockResolvedValue({ id: "wle_1", status: "rejected" });

      const result = await rejectWaitlistEntry("wle_1");

      expect(revokeInvitationMock).not.toHaveBeenCalled();
      expect(rejectMock).toHaveBeenCalledWith("wle_1");
      expect(result).toBeUndefined();
    });

    it("招待の取り消しが失敗したら却下せずエラーを返しSentryに送る", async () => {
      getInvitationListMock.mockResolvedValue({
        data: [
          { id: "inv_1", emailAddress: "a@example.com", status: "pending" },
        ],
      });
      const err = new Error("network error");
      revokeInvitationMock.mockRejectedValue(err);

      const result = await rejectWaitlistEntry("wle_1");

      expect(rejectMock).not.toHaveBeenCalled();
      expect(result).toEqual({ error: "network error" });
      expect(captureExceptionMock).toHaveBeenCalledWith(
        err,
        expect.objectContaining({ tags: { action: "rejectWaitlistEntry" } })
      );
    });

    it("却下がClerkの4xxで失敗したらエラーを返しSentryに送らない", async () => {
      getInvitationListMock.mockResolvedValue({ data: [] });
      rejectMock.mockRejectedValue(
        new ClerkAPIResponseError("not found", { data: [], status: 404 })
      );

      const result = await rejectWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "not found" });
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });
  });
});
