import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import type { Database } from "@/types/database.types";

// GitHub issue #404: user.createdの再送で行が増えず、200を返し続けることを
// 実DB・実際のsvix署名で確認する。next/headersはテスト環境では使えないため、
// 送ったリクエストのヘッダーをそのまま返すようにモックする。
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { headers } from "next/headers";
import { POST } from "@/app/api/webhooks/clerk/route";

const WEBHOOK_SECRET = `whsec_${Buffer.from("clerk-user-created-webhook-test").toString("base64")}`;
const CLERK_USER_ID = "clerk_test_user_created_webhook";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function signedRequest(svixId: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const timestamp = new Date();
  const signature = new Webhook(WEBHOOK_SECRET).sign(svixId, timestamp, body);
  const req = new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: {
      "svix-id": svixId,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
    },
    body,
  });
  vi.mocked(headers).mockResolvedValue(req.headers as never);
  return req;
}

const USER_CREATED = {
  type: "user.created",
  data: {
    id: CLERK_USER_ID,
    email_addresses: [{ email_address: "user-created-webhook@example.com" }],
    first_name: "太郎",
    last_name: "山田",
  },
};

async function cleanup() {
  await supabase.from("users").delete().eq("clerk_user_id", CLERK_USER_ID);
}

beforeAll(async () => {
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await cleanup();
});

afterAll(cleanup);

describe("POST /api/webhooks/clerk（user.created）", () => {
  it("usersに行を作成する", async () => {
    const res = await POST(signedRequest("msg_user_created_1", USER_CREATED));
    expect(res.status).toBe(200);

    const { data: rows } = await supabase
      .from("users")
      .select("email, first_name, last_name, rank_code, onboarding_completed")
      .eq("clerk_user_id", CLERK_USER_ID);
    expect(rows).toEqual([
      {
        email: "user-created-webhook@example.com",
        first_name: "太郎",
        last_name: "山田",
        rank_code: "starter",
        onboarding_completed: false,
      },
    ]);
  });

  it("再送されても200を返し、行は増えない", async () => {
    const res = await POST(signedRequest("msg_user_created_1", USER_CREATED));
    expect(res.status).toBe(200);

    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clerk_user_id", CLERK_USER_ID);
    expect(count).toBe(1);
  });

  it("署名が不正なら400を返す", async () => {
    const req = signedRequest("msg_user_created_2", USER_CREATED);
    const tampered = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({
        ...USER_CREATED,
        data: { ...USER_CREATED.data, id: "clerk_tampered" },
      }),
    });

    const res = await POST(tampered);
    expect(res.status).toBe(400);
  });
});
