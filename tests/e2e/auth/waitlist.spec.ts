import { clerkClient } from "@clerk/nextjs/server";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import {
  cleanupTestUser,
  getClerkUserIdByEmail,
  setupClerkTestingTokenForInvitation,
  slotEmail,
} from "../helpers/clerk-test-invitation";

// Clerkはメールアドレスごとに1つのwaitlist entryしか保持できず、一度
// invited/rejectedになったentryは再送信しても同じentryが返ってきてpendingに
// 戻らない（pending以外は削除もできない）。テスト実行のたびに一意なメール
// アドレスを使うことで、この制約による再実行時の失敗を避ける
const TEST_EMAIL = `info+clerk_test_waitlist_${Date.now()}@wknd-studio.com`;
const ADMIN_EMAIL = slotEmail("info+clerk_test_admin_waitlist@wknd-studio.com");

async function findPendingWaitlistEntry(email: string) {
  const clerk = await clerkClient();
  const { data } = await clerk.waitlistEntries.list({
    status: "pending",
    query: email,
  });
  return data.find((entry) => entry.emailAddress === email);
}

async function findPendingInvitation(email: string) {
  const clerk = await clerkClient();
  const { data } = await clerk.invitations.getInvitationList({
    query: email,
    status: "pending",
  });
  return data.find((inv) => inv.emailAddress === email);
}

async function cleanupWaitlistEntry(email: string) {
  const entry = await findPendingWaitlistEntry(email);
  if (!entry) return;
  const clerk = await clerkClient();
  await clerk.waitlistEntries.reject(entry.id).catch(() => {});
}

/**
 * 管理者のClerkユーザーを用意する。middleware・Server Actionはセッショントークンの
 * metadata.role（publicMetadata）で管理者を判定する。前回の実行が中断され
 * 削除されずに残っていれば再利用する
 */
async function ensureAdminUser(email: string) {
  const existingId = await getClerkUserIdByEmail(email);
  if (existingId) return;
  const clerkApi = await clerkClient();
  await clerkApi.users.createUser({
    emailAddress: [email],
    // ログインはclerk.signInのサインイントークンで行い、パスワードは使わないので乱数でよい
    password: `E2e-${crypto.randomUUID()}`,
    skipLegalChecks: true,
    publicMetadata: { role: "admin" },
  });
}

// 公開ページからの参加希望送信→管理画面の承認ボタン（approveWaitlistEntry →
// invitations.createInvitation）で招待が発行され、その招待URLから自前の
// /sign-upに進めるところまでを、本番と同じ承認経路で検証する。
// 招待テンプレート（waitlist_invitation）やNEXT_PUBLIC_APP_URLの設定ミスもここで検出する。
// パスワード設定以降は、createInvitation経由のregistration.spec.ts等が検証している
test.describe("Waitlist経由の参加希望と管理者承認", () => {
  test.afterEach(async () => {
    // 承認で発行された招待を取り消してから、pendingのままのエントリを却下する
    await cleanupTestUser(TEST_EMAIL);
    await cleanupWaitlistEntry(TEST_EMAIL);
    const adminId = await getClerkUserIdByEmail(ADMIN_EMAIL);
    if (adminId) {
      const clerkApi = await clerkClient();
      await clerkApi.users.deleteUser(adminId).catch(() => {});
    }
  });

  test("参加希望を送信し、管理者が管理画面で承認すると、招待URLからサインアップ画面に進める", async ({
    browser,
    page,
  }) => {
    // 参加希望者と管理者の2人分の画面操作を含むため、既定のタイムアウトでは不足しうる
    test.slow();
    await setupClerkTestingToken({ page });
    await page.goto("/waitlist");
    // 日本語ローカライズ後もラベル文言に依存しないよう、Clerkが付与する
    // 安定した要素属性(id・data-localization-key)でフォーム要素を指定する
    await page.locator("#emailAddress-field").fill(TEST_EMAIL);
    await page
      .locator('[data-localization-key="waitlist.start.formButton"]')
      .click();

    await expect(async () => {
      expect(await findPendingWaitlistEntry(TEST_EMAIL)).toBeDefined();
    }).toPass();

    // 管理者は別のブラウザコンテキストでログインする
    await ensureAdminUser(ADMIN_EMAIL);
    const adminContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const adminPage = await adminContext.newPage();
    // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
    await adminPage.goto("/");
    await clerk.signIn({ page: adminPage, emailAddress: ADMIN_EMAIL });
    await adminPage.goto("/admin/waitlist");

    const row = adminPage.getByRole("row").filter({ hasText: TEST_EMAIL });
    await row.getByRole("button", { name: "承認" }).click();
    await expect(adminPage.getByRole("status")).toHaveText(
      `${TEST_EMAIL} を承認し招待メールを送信しました`
    );
    await expect(row).toContainText("招待済み（返信待ち）");
    await adminContext.close();

    const invitation = await findPendingInvitation(TEST_EMAIL);
    expect(invitation?.url).toBeTruthy();

    await setupClerkTestingTokenForInvitation(page);
    await page.goto(invitation!.url!);

    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.locator("#password-field")).toBeVisible();
  });
});
