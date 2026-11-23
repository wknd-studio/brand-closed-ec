import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";
import { CONTACT } from "@/app/legal/legal-notice";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";
import { ensureOnboardedMember } from "../helpers/onboarded-member-row";

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GitHub issue #724: 入会から6ヶ月の最低利用期間内の会員には、退会を押す前に、
// 退会できるようになる日と運営の問い合わせ先をアカウント設定の「退会」欄で示す
test.describe.serial("最低利用期間内の会員の退会欄", () => {
  let email: string;
  let joinedAt: Date;

  test.beforeAll(async ({}, workerInfo) => {
    email = slotEmail(
      `info+clerk_test_withdrawal_period_w${workerInfo.parallelIndex}@wknd-studio.com`
    );
    await cleanupTestUser(email);
    const created = await (
      await clerkClient()
    ).users.createUser({
      emailAddress: [email],
      password: "TestPassw0rd!12345",
      skipLegalChecks: true,
    });
    await ensureOnboardedMember(supabaseAdmin(), created.id, email);
    // 前回の実行の行が残っていても期間内になるよう、入会日を今にする
    joinedAt = new Date();
    const { error } = await supabaseAdmin()
      .from("users")
      .update({ created_at: joinedAt.toISOString() })
      .eq("clerk_user_id", created.id)
      .is("deleted_at", null);
    if (error) throw new Error(`入会日の更新に失敗しました: ${error.message}`);
  });

  test.afterAll(async () => {
    await cleanupTestUser(email);
  });

  test("退会欄に、退会できるようになる日（JST）と運営の問い合わせ先が出る", async ({
    page,
  }) => {
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/settings");

    const withdrawableFrom = MinimumMembershipPeriod.startingAt(
      joinedAt
    ).withdrawableFrom.toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const section = page.getByRole("region", { name: "退会" });
    await expect(section).toContainText("入会から6ヶ月間");
    await expect(section).toContainText(`${withdrawableFrom}から退会できます`);
    await expect(section).toContainText(CONTACT.email.text);
    await expect(section).toContainText(CONTACT.phone.text);
  });
});
