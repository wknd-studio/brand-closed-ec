import { clerkClient } from "@clerk/nextjs/server";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  cleanupTestUser,
  getClerkUserIdByEmail,
  setupClerkTestingTokenForInvitation,
  slotEmail,
} from "../helpers/clerk-test-invitation";

// Clerkはメールアドレスごとに1つのwaitlist entryしか保持できず、一度
// invited/rejectedになったentryは再送信しても同じentryが返ってきてpendingに
// 戻らない（pending以外は削除もできない）。テストごと・実行のたびに一意なメール
// アドレスを使うことで、この制約による再実行時・テスト間の失敗を避ける
function uniqueWaitlistEmail() {
  return `info+clerk_test_waitlist_${Date.now()}_${crypto.randomUUID().slice(0, 8)}@wknd-studio.com`;
}
// 管理者ユーザーはテストの後片付けで削除する。同じファイルのテストが並列に走ると
// 作成・削除が衝突するため、同時に走るワーカーごと(parallelIndex)に分ける
function adminEmailFor(parallelIndex: number) {
  return slotEmail(
    `info+clerk_test_admin_waitlist_p${parallelIndex}@wknd-studio.com`
  );
}

async function findPendingWaitlistEntry(email: string) {
  const clerk = await clerkClient();
  const { data } = await clerk.waitlistEntries.list({
    status: "pending",
    query: email,
  });
  return data.find((entry) => entry.emailAddress === email);
}

async function findInvitation(
  email: string,
  status: "pending" | "revoked" = "pending"
) {
  const clerk = await clerkClient();
  const { data } = await clerk.invitations.getInvitationList({
    query: email,
    status,
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

/** 公開ページの/waitlistから参加希望を送信し、Clerkにpendingのエントリができるまで待つ */
async function submitWaitlist(page: Page, email: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/waitlist");
  // 日本語ローカライズ後もラベル文言に依存しないよう、Clerkが付与する
  // 安定した要素属性(id・data-localization-key)でフォーム要素を指定する
  await page.locator("#emailAddress-field").fill(email);
  await page
    .locator('[data-localization-key="waitlist.start.formButton"]')
    .click();

  await expect(async () => {
    expect(await findPendingWaitlistEntry(email)).toBeDefined();
  }).toPass();
}

/**
 * 管理者として別のブラウザコンテキストでログインし、管理画面でエントリを承認する。
 * 却下まで続けて操作できるよう、管理者のコンテキストと対象の行を返す（closeは呼び出し側）
 */
async function approveAsAdmin(
  browser: Browser,
  email: string,
  adminEmail: string
) {
  await ensureAdminUser(adminEmail);
  const adminContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
  });
  const adminPage = await adminContext.newPage();
  // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
  await adminPage.goto("/");
  await clerk.signIn({ page: adminPage, emailAddress: adminEmail });
  await adminPage.goto("/admin/waitlist");

  const row = adminPage.getByRole("row").filter({ hasText: email });
  await row.getByRole("button", { name: "承認" }).click();
  await expect(adminPage.getByRole("status")).toHaveText(
    `${email} を承認し招待メールを送信しました`
  );
  await expect(row).toContainText("招待済み（返信待ち）");
  return { adminContext, adminPage, row };
}

// 公開ページからの参加希望送信→管理画面の承認ボタン（approveWaitlistEntry →
// invitations.createInvitation）で招待が発行され、その招待URLから自前の
// /sign-upに進めるところまでを、本番と同じ承認経路で検証する。
// 招待テンプレート（waitlist_invitation）やNEXT_PUBLIC_APP_URLの設定ミスもここで検出する。
// パスワード設定以降は、createInvitation経由のregistration.spec.ts等が検証している。
// 承認後に却下した場合（rejectWaitlistEntryが招待を取り消す）に、控えていた招待URLから
// 登録できないことも、Clerkの実際の挙動で検証する
test.describe("Waitlist経由の参加希望と管理者承認", () => {
  let testEmail: string;
  let adminEmail: string;

  test.beforeEach(({}, testInfo) => {
    testEmail = uniqueWaitlistEmail();
    adminEmail = adminEmailFor(testInfo.parallelIndex);
  });

  test.afterEach(async () => {
    // 承認で発行された招待を取り消してから、pendingのままのエントリを却下する。
    // cleanupTestUserの取り消しはqueryで絞らず既定の件数しか見ないため、
    // 共有インスタンスに招待が溜まっていても漏れないようメールアドレスで絞って取り消す
    const invitation = await findInvitation(testEmail);
    if (invitation) {
      const clerkApi = await clerkClient();
      await clerkApi.invitations
        .revokeInvitation(invitation.id)
        .catch(() => {});
    }
    await cleanupWaitlistEntry(testEmail);
    // 管理者のClerkユーザーに加え、Webhookで作られ得るusers行も削除する
    await cleanupTestUser(adminEmail);
  });

  test("参加希望を送信し、管理者が管理画面で承認すると、招待URLからサインアップ画面に進める", async ({
    browser,
    page,
  }) => {
    // 参加希望者と管理者の2人分の画面操作を含むため、既定のタイムアウトでは不足しうる
    test.slow();
    await submitWaitlist(page, testEmail);

    const { adminContext } = await approveAsAdmin(
      browser,
      testEmail,
      adminEmail
    );
    await adminContext.close();

    const invitation = await findInvitation(testEmail);
    expect(invitation?.url).toBeTruthy();

    await setupClerkTestingTokenForInvitation(page);
    await page.goto(invitation!.url!);

    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.locator("#password-field")).toBeVisible();
  });

  test("承認後に却下すると招待が取り消され、招待URLを開いてもサインアップできない", async ({
    browser,
    page,
  }) => {
    test.slow();
    await submitWaitlist(page, testEmail);

    const { adminContext, adminPage, row } = await approveAsAdmin(
      browser,
      testEmail,
      adminEmail
    );
    // 却下前に招待URLを控えておく（却下後は取り消し済みの招待として残る）
    const invitation = await findInvitation(testEmail);
    expect(invitation?.url).toBeTruthy();

    // 却下ボタンはwindow.confirmで確認する。Playwrightは既定でダイアログを閉じる(キャンセル)ため受け入れる
    adminPage.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "却下" }).click();
    await expect(adminPage.getByRole("status")).toHaveText(
      "参加希望を却下しました"
    );
    await expect(row).toHaveCount(0);
    await adminContext.close();

    const revoked = await findInvitation(testEmail, "revoked");
    expect(revoked?.id).toBe(invitation!.id);
    expect(revoked?.status).toBe("revoked");

    await setupClerkTestingTokenForInvitation(page);
    await page.goto(invitation!.url!);

    // 取り消し済みの招待のticketは署名・有効期限は正しいため/sign-upまでは進むが、
    // Clerkが受諾を拒否し、サインアップフォームの代わりに「アクセス制限」画面と
    // 取り消しのエラー（Clerk APIのメッセージのため日本語化されない）を表示する
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(
      page.locator('[data-localization-key="signUp.restrictedAccess.title"]')
    ).toBeVisible();
    await expect(page.locator(".cl-alertText")).toHaveText(
      "The invitation was revoked."
    );
    await expect(page.locator("#password-field")).toHaveCount(0);
  });
});
