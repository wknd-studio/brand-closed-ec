import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import type { Database } from "@/types/database.types";

// GitHub issue #531: 退会処理を通らずにClerkアカウントが削除されたら、
// Sentryにerrorで通知し、usersには何も変更を加えないことを実DB・実際のsvix署名で確認する。
// next/headersはテスト環境では使えないため、送ったリクエストのヘッダーをそのまま返すようにモックする。
vi.mock("next/headers", () => ({ headers: vi.fn() }));
const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureMessage: captureMessageMock,
  captureException: vi.fn(),
}));

import { headers } from "next/headers";
import { POST } from "@/app/api/webhooks/clerk/route";

const WEBHOOK_SECRET = `whsec_${Buffer.from("clerk-user-deleted-webhook-test").toString("base64")}`;
const ACTIVE_CLERK_ID = "clerk_test_user_deleted_active";
const WITHDRAWN_CLERK_ID = "clerk_test_user_deleted_withdrawn";
const UNKNOWN_CLERK_ID = "clerk_test_user_deleted_unknown";

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

// Clerkのuser.deletedのdataは削除済みオブジェクト（id・object・deleted）だけを持つ
function userDeleted(clerkUserId: string) {
  return {
    type: "user.deleted",
    data: { id: clerkUserId, object: "user", deleted: true },
  };
}

const CLERK_IDS = [ACTIVE_CLERK_ID, WITHDRAWN_CLERK_ID, UNKNOWN_CLERK_ID];
let activeUserId: string;

async function cleanup() {
  await supabase.from("users").delete().in("clerk_user_id", CLERK_IDS);
}

async function findUsers() {
  const { data } = await supabase
    .from("users")
    .select("clerk_user_id, deleted_at, rank_code, onboarding_completed")
    .in("clerk_user_id", CLERK_IDS)
    .order("clerk_user_id");
  return data;
}

beforeAll(async () => {
  process.env.CLERK_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await cleanup();

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        clerk_user_id: ACTIVE_CLERK_ID,
        email: "user-deleted-active@example.com",
        first_name: "太郎",
        last_name: "山田",
      },
      {
        clerk_user_id: WITHDRAWN_CLERK_ID,
        email: "user-deleted-withdrawn@example.com",
        first_name: "花子",
        last_name: "山田",
        deleted_at: "2026-10-01T00:00:00Z",
      },
    ])
    .select("id, clerk_user_id");
  if (error) throw error;
  activeUserId = data.find((row) => row.clerk_user_id === ACTIVE_CLERK_ID)!.id;
});

beforeEach(() => {
  captureMessageMock.mockClear();
});

afterAll(cleanup);

describe("POST /api/webhooks/clerk（user.deleted）", () => {
  it("有効な会員のClerkアカウントが削除されたら、Sentryにerrorで通知し、200を返してusersは変更しない", async () => {
    const before = await findUsers();

    const res = await POST(
      signedRequest("msg_user_deleted_active", userDeleted(ACTIVE_CLERK_ID))
    );
    expect(res.status).toBe(200);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][1]).toMatchObject({
      level: "error",
      tags: { webhook: "clerk", eventType: "user.deleted" },
      extra: { clerkUserId: ACTIVE_CLERK_ID, userId: activeUserId },
    });
    expect(await findUsers()).toEqual(before);
  });

  it.each([
    ["退会処理で退会済みの会員", WITHDRAWN_CLERK_ID],
    ["usersに行が無いClerkユーザー", UNKNOWN_CLERK_ID],
  ])(
    "%sの削除では通知せず、200を返してusersは変更しない",
    async (_label, clerkUserId) => {
      const before = await findUsers();

      const res = await POST(
        signedRequest(
          `msg_user_deleted_${clerkUserId}`,
          userDeleted(clerkUserId)
        )
      );
      expect(res.status).toBe(200);

      expect(captureMessageMock).not.toHaveBeenCalled();
      expect(await findUsers()).toEqual(before);
    }
  );
});
