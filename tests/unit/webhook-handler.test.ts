import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("svix", () => ({
  Webhook: vi.fn(),
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn(),
}));

import { headers } from "next/headers";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { POST } from "@/app/api/webhooks/clerk/route";

const ALL_SVIX_HEADERS: Record<string, string | null> = {
  "svix-id": "test-id",
  "svix-timestamp": "12345",
  "svix-signature": "v1,test-sig",
};

function setupHeaders(overrides: Record<string, string | null> = {}) {
  const merged = { ...ALL_SVIX_HEADERS, ...overrides };
  vi.mocked(headers).mockResolvedValue({
    get: vi.fn((key: string) => merged[key] ?? null),
  } as never);
}

function setupWebhook(verify: () => unknown) {
  vi.mocked(Webhook).mockImplementation(function () {
    return { verify: vi.fn().mockImplementation(verify) };
  } as never);
}

function makeRequest(body = "{}") {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body,
  });
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
  });

  describe("svix ヘッダー検証", () => {
    it("svix-id がない場合は 400 を返す", async () => {
      setupHeaders({ "svix-id": null });
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });

    it("svix-timestamp がない場合は 400 を返す", async () => {
      setupHeaders({ "svix-timestamp": null });
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });

    it("svix-signature がない場合は 400 を返す", async () => {
      setupHeaders({ "svix-signature": null });
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });
  });

  describe("署名検証", () => {
    it("署名が不正な場合は 400 を返す", async () => {
      setupHeaders();
      setupWebhook(() => {
        throw new Error("invalid signature");
      });
      const res = await POST(makeRequest());
      expect(res.status).toBe(400);
    });
  });

  describe("user.created イベント", () => {
    it("users テーブルに INSERT して 200 を返す", async () => {
      setupHeaders();

      const payload = {
        type: "user.created",
        data: {
          id: "user_abc",
          email_addresses: [{ email_address: "test@example.com" }],
          first_name: "太郎",
          last_name: "山田",
        },
      };
      setupWebhook(() => payload);

      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({ insert: mockInsert }),
      } as never);

      const res = await POST(makeRequest(JSON.stringify(payload)));
      expect(res.status).toBe(200);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          clerk_user_id: "user_abc",
          email: "test@example.com",
          first_name: "太郎",
          last_name: "山田",
          rank: "free",
          onboarding_completed: false,
        })
      );
    });
  });

  describe("その他のイベント", () => {
    it("user.created 以外は DB 操作なしで 200 を返す", async () => {
      setupHeaders();
      setupWebhook(() => ({ type: "user.updated", data: {} }));

      const mockFrom = vi.fn();
      vi.mocked(createAdminClient).mockReturnValue({ from: mockFrom } as never);

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
