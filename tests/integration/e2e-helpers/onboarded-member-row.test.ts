import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createUser } from "@/use-cases/create-user";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { ensureMemberRow } from "../../e2e/helpers/onboarded-member-row";

// GitHub issue #494: E2Eの準備処理（tests/e2e/helpers/test-member.ts）が、
// stgでuser.created Webhookが非同期に作る行と競合して一意制約違反で落ちていた。
// Webhookの行が「探す前」「探してから作るまでの間」「作った後」のどこで作られても
// 失敗せず、指定した状態の有効な行が1つだけ残ることを実DBで確認する。
// 未入会の行（#503: tests/e2e/auth/onboarding-success.spec.ts の準備処理）も同じく確認する。
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
    {
      userRepo: new SupabaseUserRepository(supabase),
      // 実在しないClerkユーザーのため、Clerkへの更新は何もしない
      accountGateway: {
        banUser: async () => {},
        updateOnboardingMetadata: async () => {},
        disableSelfDelete: async () => {},
      },
    }
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
  { label: "入会済み", onboardingCompleted: true },
  { label: "未入会", onboardingCompleted: false },
])(
  "ensureMemberRow（$label）と user.created Webhook の行の競合",
  ({ label, onboardingCompleted }) => {
    it(`Webhookの行が探す前に作られていれば、その行を${label}にする`, async () => {
      await deliverUserCreatedWebhook();
      const [webhookRow] = await activeRows();

      const userId = await ensureMemberRow(supabase, CLERK_USER_ID, EMAIL, {
        onboardingCompleted,
      });

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

    it(`Webhookの行が探してから作るまでの間に作られても失敗せず、その行を${label}にする`, async () => {
      let webhookRowId: string | undefined;

      const userId = await ensureMemberRow(supabase, CLERK_USER_ID, EMAIL, {
        onboardingCompleted,
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

    it(`Webhookの行が作った後に届いても、${label}の行が1つだけ残る`, async () => {
      const userId = await ensureMemberRow(supabase, CLERK_USER_ID, EMAIL, {
        onboardingCompleted,
      });

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

    it(`前回の実行が中断され別の状態の行が残っていても、その行を${label}に戻す`, async () => {
      const leftoverId = await ensureMemberRow(supabase, CLERK_USER_ID, EMAIL, {
        onboardingCompleted: !onboardingCompleted,
      });

      const userId = await ensureMemberRow(supabase, CLERK_USER_ID, EMAIL, {
        onboardingCompleted,
      });

      expect(userId).toBe(leftoverId);
      expect(await activeRows()).toEqual([
        {
          id: userId,
          onboarding_completed: onboardingCompleted,
          rank_code: "starter",
          member_type: "individual",
        },
      ]);
    });

    it(`Webhookが届かなければ、${label}の行を新しく作る`, async () => {
      const userId = await ensureMemberRow(supabase, CLERK_USER_ID, EMAIL, {
        onboardingCompleted,
      });

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
