import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」7番（GitHub issue #218）
// Clerk Webhook（organizationMembership.*）→ admin_users/admin_membershipsへの
// ミラーリングをPOSTハンドラー経由・実DBで検証する。
// svix署名検証はUnitテスト（tests/unit/webhook-handler.test.ts）で確認済みのため、
// ここではWebhookクラスをモックしてペイロード内容のみ差し替える。

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("svix", () => ({ Webhook: vi.fn() }));

import { headers } from "next/headers";
import { Webhook } from "svix";
import { POST } from "@/app/api/webhooks/clerk/route";

const ADMIN_ORG_ID = "org_test_admin_webhook";
const CUSTOMER_ORG_ID = "org_test_customer_webhook";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const CLERK_USER_ID = "clerk_test_admin_webhook_user";

function setupHeaders() {
  vi.mocked(headers).mockResolvedValue({
    get: vi.fn(
      (key: string) =>
        ({
          "svix-id": "test-id",
          "svix-timestamp": "12345",
          "svix-signature": "v1,test-sig",
        })[key] ?? null
    ),
  } as never);
}

function setupWebhookPayload(payload: unknown) {
  vi.mocked(Webhook).mockImplementation(function () {
    return { verify: vi.fn().mockReturnValue(payload) };
  } as never);
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("clerk_user_id", CLERK_USER_ID)
    .maybeSingle();
  if (data) {
    await supabase
      .from("admin_memberships")
      .delete()
      .eq("admin_user_id", data.id);
    await supabase.from("admin_users").delete().eq("id", data.id);
  }
}

beforeAll(async () => {
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
  process.env.CLERK_ADMIN_ORGANIZATION_ID = ADMIN_ORG_ID;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("POST /api/webhooks/clerk（organizationMembership.*）", () => {
  it("運営組織のorganizationMembership.createdでadmin_user/admin_membershipを作成する", async () => {
    setupHeaders();
    setupWebhookPayload({
      type: "organizationMembership.created",
      data: {
        organization: { id: ADMIN_ORG_ID },
        public_user_data: {
          user_id: CLERK_USER_ID,
          first_name: "太郎",
          last_name: "運営",
          identifier: "admin-webhook@example.com",
        },
        role: "org:order_manager",
      },
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id, name, email")
      .eq("clerk_user_id", CLERK_USER_ID)
      .single();
    expect(adminUser?.name).toBe("太郎 運営");
    expect(adminUser?.email).toBe("admin-webhook@example.com");

    const { data: membership } = await supabase
      .from("admin_memberships")
      .select("clerk_role")
      .eq("admin_user_id", adminUser!.id)
      .single();
    expect(membership?.clerk_role).toBe("org:order_manager");
  });

  it("organizationMembership.updatedでロールを更新する", async () => {
    setupHeaders();
    setupWebhookPayload({
      type: "organizationMembership.updated",
      data: {
        organization: { id: ADMIN_ORG_ID },
        public_user_data: {
          user_id: CLERK_USER_ID,
          first_name: "太郎",
          last_name: "運営",
          identifier: "admin-webhook@example.com",
        },
        role: "org:admin",
      },
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("clerk_user_id", CLERK_USER_ID)
      .single();
    const { data: membership } = await supabase
      .from("admin_memberships")
      .select("clerk_role")
      .eq("admin_user_id", adminUser!.id)
      .single();
    expect(membership?.clerk_role).toBe("org:admin");
  });

  it("顧客組織（運営組織以外）のorganizationMembershipイベントは無視する", async () => {
    setupHeaders();
    setupWebhookPayload({
      type: "organizationMembership.created",
      data: {
        organization: { id: CUSTOMER_ORG_ID },
        public_user_data: {
          user_id: "clerk_test_customer_membership_ignored",
          first_name: "顧客",
          last_name: "テスト",
          identifier: "customer@example.com",
        },
        role: "org:admin",
      },
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    const { data } = await supabase
      .from("admin_users")
      .select("id")
      .eq("clerk_user_id", "clerk_test_customer_membership_ignored")
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("organizationMembership.deletedでadmin_membershipを削除する（admin_userは残す）", async () => {
    setupHeaders();
    setupWebhookPayload({
      type: "organizationMembership.deleted",
      data: {
        organization: { id: ADMIN_ORG_ID },
        public_user_data: { user_id: CLERK_USER_ID },
      },
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id")
      .eq("clerk_user_id", CLERK_USER_ID)
      .single();
    expect(adminUser).not.toBeNull();

    const { data: membership } = await supabase
      .from("admin_memberships")
      .select("id")
      .eq("admin_user_id", adminUser!.id)
      .maybeSingle();
    expect(membership).toBeNull();
  });
});
