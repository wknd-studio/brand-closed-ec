import { describe, it, expect, vi, beforeEach } from "vitest";

const { listMock, inviteMock, rejectMock, currentUserMock } = vi.hoisted(
  () => ({
    listMock: vi.fn(),
    inviteMock: vi.fn(),
    rejectMock: vi.fn(),
    currentUserMock: vi.fn(),
  })
);

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: currentUserMock,
  clerkClient: vi.fn().mockResolvedValue({
    waitlistEntries: {
      list: listMock,
      invite: inviteMock,
      reject: rejectMock,
    },
  }),
}));

import { GET, POST, DELETE } from "@/app/api/admin/waitlist/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/admin/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("権限チェック", () => {
    it("admin以外はGETで401になる", async () => {
      currentUserMock.mockResolvedValue({ publicMetadata: { role: "member" } });

      const res = await GET();

      expect(res.status).toBe(401);
      expect(listMock).not.toHaveBeenCalled();
    });

    it("admin以外はPOSTで401になる", async () => {
      currentUserMock.mockResolvedValue(null);

      const res = await POST(jsonRequest({ waitlistEntryId: "wle_1" }));

      expect(res.status).toBe(401);
      expect(inviteMock).not.toHaveBeenCalled();
    });

    it("admin以外はDELETEで401になる", async () => {
      currentUserMock.mockResolvedValue({ publicMetadata: {} });

      const res = await DELETE(jsonRequest({ waitlistEntryId: "wle_1" }));

      expect(res.status).toBe(401);
      expect(rejectMock).not.toHaveBeenCalled();
    });
  });

  describe("admin操作", () => {
    beforeEach(() => {
      currentUserMock.mockResolvedValue({ publicMetadata: { role: "admin" } });
    });

    it("GETでpendingなwaitlist entryの一覧を返す", async () => {
      listMock.mockResolvedValue({
        data: [
          { id: "wle_1", emailAddress: "a@example.com", status: "pending" },
        ],
      });

      const res = await GET();
      const body = await res.json();

      expect(listMock).toHaveBeenCalledWith({ status: "pending" });
      expect(body).toEqual([
        { id: "wle_1", emailAddress: "a@example.com", status: "pending" },
      ]);
    });

    it("POSTでwaitlistEntryId未指定なら400になる", async () => {
      const res = await POST(jsonRequest({}));

      expect(res.status).toBe(400);
      expect(inviteMock).not.toHaveBeenCalled();
    });

    it("POSTで承認しinviteを呼ぶ", async () => {
      inviteMock.mockResolvedValue({ id: "wle_1", status: "invited" });

      const res = await POST(jsonRequest({ waitlistEntryId: "wle_1" }));
      const body = await res.json();

      expect(inviteMock).toHaveBeenCalledWith("wle_1");
      expect(res.status).toBe(200);
      expect(body).toEqual({ id: "wle_1", status: "invited" });
    });

    it("POSTでinviteが失敗したら422を返す", async () => {
      inviteMock.mockRejectedValue(new Error("already invited"));

      const res = await POST(jsonRequest({ waitlistEntryId: "wle_1" }));
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error).toBe("already invited");
    });

    it("DELETEでwaitlistEntryId未指定なら400になる", async () => {
      const res = await DELETE(jsonRequest({}));

      expect(res.status).toBe(400);
      expect(rejectMock).not.toHaveBeenCalled();
    });

    it("DELETEで却下しrejectを呼ぶ", async () => {
      rejectMock.mockResolvedValue({ id: "wle_1", status: "rejected" });

      const res = await DELETE(jsonRequest({ waitlistEntryId: "wle_1" }));
      const body = await res.json();

      expect(rejectMock).toHaveBeenCalledWith("wle_1");
      expect(res.status).toBe(200);
      expect(body).toEqual({ id: "wle_1", status: "rejected" });
    });
  });
});
