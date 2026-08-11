import { describe, it, expect, vi, beforeEach } from "vitest";

const { createInvitationMock, getInvitationListMock, rejectMock, authMock } =
  vi.hoisted(() => ({
    createInvitationMock: vi.fn(),
    getInvitationListMock: vi.fn(),
    rejectMock: vi.fn(),
    authMock: vi.fn(),
  }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn().mockResolvedValue({
    invitations: {
      createInvitation: createInvitationMock,
      getInvitationList: getInvitationListMock,
    },
    waitlistEntries: {
      reject: rejectMock,
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

import {
  approveWaitlistEntry,
  rejectWaitlistEntry,
} from "@/app/admin/waitlist/actions";

describe("admin/waitlist actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("権限チェック", () => {
    it("admin以外はapproveできない", async () => {
      authMock.mockResolvedValue({
        userId: "user_1",
        sessionClaims: { metadata: { role: "member" } },
      });

      const result = await approveWaitlistEntry("a@example.com");

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
    });

    it("承認時にredirectUrlとtemplateSlugを指定して招待を作成する", async () => {
      createInvitationMock.mockResolvedValue({ id: "inv_1" });

      const result = await approveWaitlistEntry("a@example.com");

      expect(createInvitationMock).toHaveBeenCalledWith({
        emailAddress: "a@example.com",
        redirectUrl: "/sign-up",
        templateSlug: "waitlist_invitation",
      });
      expect(result).toBeUndefined();
    });

    it("招待作成が失敗したらエラーを返す", async () => {
      createInvitationMock.mockRejectedValue(new Error("already invited"));

      const result = await approveWaitlistEntry("a@example.com");

      expect(result).toEqual({ error: "already invited" });
    });

    it("却下時にwaitlistEntries.rejectを呼ぶ", async () => {
      rejectMock.mockResolvedValue({ id: "wle_1", status: "rejected" });

      const result = await rejectWaitlistEntry("wle_1");

      expect(rejectMock).toHaveBeenCalledWith("wle_1");
      expect(result).toBeUndefined();
    });

    it("却下が失敗したらエラーを返す", async () => {
      rejectMock.mockRejectedValue(new Error("not found"));

      const result = await rejectWaitlistEntry("wle_1");

      expect(result).toEqual({ error: "not found" });
    });
  });
});
