import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createUser } from "@/use-cases/create-user";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import {
  ensureMemberRow,
  ensureOnboardedMember,
} from "../../e2e/helpers/onboarded-member-row";

// GitHub issue #494・#503: E2Eの準備処理（tests/e2e/helpers/test-member.ts の入会済みの行、
// tests/e2e/auth/onboarding-success.spec.ts の未入会の行）が、stgでuser.created Webhookが
// 非同期に作る行と競合して一意制約違反で落ちていた。
// Webhookの行が「探す前」「探してから作るまでの間」「作った後」のどこで作られても
// 失敗せず、指定した状態の有効な行が1つだけ残ることを実DBで確認する。
// Webhookの行は、ハンドラー（src/app/api/webhooks/clerk/route.ts）と同じcreateUserで作る
const CLERK_USER_ID = "clerk_test_e2e_onboarded_member_row";
const EMAIL = "e2e-onboarded-member-row@example.com";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function deliverUserCreatedWebhook() {
  await createUser(
    { clerkUserId: CLERK_USER_ID, email: EMAIL, firstName: "", lastName: "" },
    { userRepo: new SupabaseUserRepository(supabase) }
  );
}

async function activeRows() {
  const { data, error } = await supabase
    .from("users")
    .select("id, onboarding_completed, rank_code, member_type")
    .eq("clerk_user_id", CLERK_USER_ID)
    .is("deleted_at", null);
  if (error) throw error;
  return data;
}

async function cleanup() {
  await supabase.from("users").delete().eq("clerk_user_id", CLERK_USER_ID);
}

beforeEach(cleanup);
afterAll(cleanup);

describe.each([
  {
    name: "ensureOnboardedMember（入会済みの行）",
    onboardingCompleted: true,
    ensure: (hooks?: { beforeInsert?: () => Promise<void> }) =>
      ensureOnboardedMember(supabase, CLERK_USER_ID, EMAIL, hooks),
  },
  {
    name: "ensureMemberRow（決済直前の未入会の行）",
    onboardingCompleted: false,
    ensure: (hooks?: { beforeInsert?: () => Promise<void> }) =>
      ensureMemberRow(
        supabase,
        CLERK_USER_ID,
        EMAIL,
        { onboardingCompleted: false },
        hooks
      ),
  },
])(
  "$name と user.created Webhook の行の競合",
  ({ onboardingCompleted, ensure }) => {
    it("Webhookの行が探す前に作られていれば、その行を指定した状態にする", async () => {
      await deliverUserCreatedWebhook();
      const [webhookRow] = await activeRows();

      const userId = await ensure();

      expect(userId).toBe(webhookRow.id);
      expect(await activeRows()).toEqual([
        {
          id: userId,
          onboarding_completed: onboardingCompleted,
          rank_code: "starter",
          member_type: "individual",
        },
      ]);
    });

    it("Webhookの行が探してから作るまでの間に作られても失敗せず、その行を指定した状態にする", async () => {
      let webhookRowId: string | undefined;

      const userId = await ensure({
        beforeInsert: async () => {
          await deliverUserCreatedWebhook();
          webhookRowId = (await activeRows())[0].id;
        },
      });

      expect(userId).toBe(webhookRowId);
      expect(await activeRows()).toEqual([
        {
          id: userId,
          onboarding_completed: onboardingCompleted,
          rank_code: "starter",
          member_type: "individual",
        },
      ]);
    });

    it("Webhookの行が作った後に届いても、指定した状態の行が1つだけ残る", async () => {
      const userId = await ensure();

      await deliverUserCreatedWebhook();

      expect(await activeRows()).toEqual([
        {
          id: userId,
          onboarding_completed: onboardingCompleted,
          rank_code: "starter",
          member_type: "individual",
        },
      ]);
    });

    it("Webhookが届かなければ、指定した状態の行を新しく作る", async () => {
      const userId = await ensure();

      expect(await activeRows()).toEqual([
        {
          id: userId,
          onboarding_completed: onboardingCompleted,
          rank_code: "starter",
          member_type: "individual",
        },
      ]);
    });
  }
);
