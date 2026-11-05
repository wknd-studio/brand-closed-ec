import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// GitHub issue #531: stgのClerk Webhookはuser.deletedで、有効なusers行が残っている会員の
// 削除をSentryにerrorで通知する。E2Eの後片付け・準備がClerkユーザーを先に消すと、
// Webhookが届いた時点で行が残っていれば偽の通知になるため、Clerkユーザーを消す時点で
// そのユーザーの有効な行が残っていないことを実DBで確認する。Clerkの呼び出しはモックする
const { clerkMock, activeRowsAtDelete } = vi.hoisted(() => ({
  clerkMock: {
    users: {
      getUserList: vi.fn(),
      deleteUser: vi.fn(),
    },
    invitations: {
      getInvitationList: vi.fn(),
      revokeInvitation: vi.fn(),
      createInvitation: vi.fn(),
    },
  },
  activeRowsAtDelete: [] as number[],
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => clerkMock),
}));

import {
  cleanupTestUser,
  createTestInvitation,
} from "../../e2e/helpers/clerk-test-invitation";

const CLERK_USER_ID = "clerk_test_e2e_clerk_test_invitation";
const EMAIL = "e2e-clerk-test-invitation@example.com";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function countActiveRows() {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("clerk_user_id", CLERK_USER_ID)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function cleanup() {
  await supabase.from("users").delete().eq("clerk_user_id", CLERK_USER_ID);
}

beforeEach(async () => {
  await cleanup();
  const { error } = await supabase.from("users").insert({
    clerk_user_id: CLERK_USER_ID,
    email: EMAIL,
    first_name: "テスト",
    last_name: "太郎",
  });
  if (error) throw error;

  activeRowsAtDelete.length = 0;
  clerkMock.users.getUserList.mockResolvedValue({
    data: [{ id: CLERK_USER_ID }],
  });
  clerkMock.users.deleteUser.mockImplementation(async () => {
    activeRowsAtDelete.push(await countActiveRows());
  });
  clerkMock.invitations.getInvitationList.mockResolvedValue({ data: [] });
  clerkMock.invitations.createInvitation.mockResolvedValue({
    url: "https://example.com/invitation",
  });
});

afterAll(cleanup);

describe("E2Eのテスト会員の後片付け・準備", () => {
  it("cleanupTestUserは、usersの行を消してからClerkユーザーを消す", async () => {
    await cleanupTestUser(EMAIL);

    expect(activeRowsAtDelete).toEqual([0]);
    expect(await countActiveRows()).toBe(0);
  });

  it("cleanupTestUserは、Clerkユーザーの削除に失敗しても例外を投げず、usersの行は消えている", async () => {
    clerkMock.users.deleteUser.mockRejectedValue(new Error("Clerk API error"));

    await expect(cleanupTestUser(EMAIL)).resolves.toBeUndefined();
    expect(await countActiveRows()).toBe(0);
  });

  it("createTestInvitationは、前回のClerkユーザーを消す前にそのusersの行を消す", async () => {
    await createTestInvitation(EMAIL);

    expect(activeRowsAtDelete).toEqual([0]);
  });
});
