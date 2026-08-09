import { clerkClient } from "@clerk/nextjs/server";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Clerkはメールアドレスごとに1つのwaitlist entryしか保持できず、一度
// invited/rejectedになったentryは再送信しても同じentryが返ってきてpendingに
// 戻らない（pending以外は削除もできない）。テスト実行のたびに一意なメール
// アドレスを使うことで、この制約による再実行時の失敗を避ける
const TEST_EMAIL = `info+clerk_test_waitlist_${Date.now()}@wknd-studio.com`;

async function findPendingWaitlistEntry(email: string) {
  const clerk = await clerkClient();
  const { data } = await clerk.waitlistEntries.list({
    status: "pending",
    query: email,
  });
  return data.find((entry) => entry.emailAddress === email);
}

async function cleanupWaitlistEntry(email: string) {
  const entry = await findPendingWaitlistEntry(email);
  if (!entry) return;
  const clerk = await clerkClient();
  await clerk.waitlistEntries.reject(entry.id).catch(() => {});
}

// waitlist-migration-plan.md: 公開ページからの参加希望送信→管理者承認
// （/api/admin/waitlistが呼ぶwaitlistEntries.inviteと同じBackend API）で
// 招待URLが発行されるところまでを検証する。
//
// 招待URL以降（Clerkのホスト型ページでのパスワード設定・規約同意〜自社アプリの
// /onboarding/account-typeへの復帰）は、createInvitation経由の既存E2E
// （registration.spec.ts等）が検証済みのコードパスと完全に同一のためここでは
// 扱わない。また、waitlistEntries.inviteはcreateInvitationと異なりredirectUrlを
// 指定できず必ずClerkホスト型ページを経由するため、setupClerkTestingTokenの
// FAPIリクエスト差し込みと相性が悪く自動操作が安定しないことも確認済み。
test.describe("Waitlist経由の参加希望と管理者承認", () => {
  test.afterEach(async ({ page }) => {
    await page.goto("/");
    await cleanupWaitlistEntry(TEST_EMAIL);
  });

  test("参加希望を送信すると承認待ちで登録され、管理者が承認すると招待URLが発行される", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/waitlist");
    await page.getByLabel("Email address").fill(TEST_EMAIL);
    await page.getByRole("button", { name: "Join the waitlist" }).click();

    let entry: Awaited<ReturnType<typeof findPendingWaitlistEntry>>;
    await expect(async () => {
      entry = await findPendingWaitlistEntry(TEST_EMAIL);
      expect(entry).toBeDefined();
    }).toPass();
    expect(entry!.status).toBe("pending");

    const clerk = await clerkClient();
    const invited = await clerk.waitlistEntries.invite(entry!.id);

    expect(invited.status).toBe("invited");
    expect(invited.invitation?.url).toBeTruthy();
  });
});
