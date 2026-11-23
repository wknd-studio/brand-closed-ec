import { clerk } from "@clerk/testing/playwright";
import { test, expect, type Page } from "@playwright/test";
import { getClerkUserIdByEmail } from "../helpers/clerk-test-invitation";

/**
 * デプロイした環境（環境変数・秘密鍵・Cloudflare Workers上のビルド・外部サービスの設定）が
 * 動いているかを、ログインして・データを書き換えずに確かめる（#649）。stgのデプロイ直後、全部のE2Eの前に
 * ログインしないもの（public.spec.ts）と一緒に `pnpm test:e2e:smoke` で流す（deploy.yml の「環境の確認（スモークテスト）」）。
 * 会員・注文・参加希望などは作らない・変えない（ログインのセッションを除く）。
 *
 * ログインにはClerkの開発用インスタンスでしか使えないTesting Tokenを使うため、本番では流せない。
 * 本番でのログインした後の確認は、人間が手で行う（docs/cicd.md「本番のデプロイ後の確認」）。
 *
 * ログインには、新しく作らず `scripts/seed-users.ts` が作る既存のアカウント（docs/seed-data.md）を使う。
 * ほかのE2Eの会員は実行ごとに別のメールアドレス（`slotEmail`）で作って消すため、後片付けで消されない。
 * ログインはパスワードを使わず、Clerkのサインイントークン（`clerk.signIn`）で行う。
 * stgにこのアカウントが無い・会員の行が無い場合は `task supabase:seed-users:stg` で入れる。
 * `/shop` に商品が出ることを確かめるため、SanityにSTARTERで見られる商品があること
 * （`task sanity:seed` のシードで足りる）も前提にする。
 *
 * 使い捨てのDBで動くPRのE2Eにはこのアカウントが無いため、`pnpm test:e2e` には含めない
 * （playwright.config.ts の smoke-signed-in のproject）
 */
const MEMBER_EMAIL = "info+test_starter@wknd-studio.com";
const ADMIN_EMAIL = "info+test_admin1@wknd-studio.com";

/** 既存のアカウントでログインする。アカウントが無ければ、入れ方を添えて失敗させる */
async function signInAs(page: Page, email: string): Promise<void> {
  if (!(await getClerkUserIdByEmail(email))) {
    throw new Error(
      `スモークテストで使うアカウント ${email} がClerkにありません。\`task supabase:seed-users:stg\` で入れてください`
    );
  }
  // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
}

test.describe("スモークテスト（ログインする）", { tag: "@smoke" }, () => {
  test("入会済みのテスト会員でログインすると /shop にブランド・商品が表示される", async ({
    page,
  }) => {
    await signInAs(page, MEMBER_EMAIL);

    // ブランド一覧はSupabase（会員のランク）とSanity（商品）の両方を読む
    await page.goto("/shop");
    // usersの行が無い・オンボーディングを終えていない会員は、middlewareがオンボーディングへ戻す
    await expect(
      page,
      "会員の行が無いときは `task supabase:seed-users:stg` で入れる"
    ).toHaveURL(/\/shop$/);
    await expect(
      page.getByRole("heading", { name: "ブランドから探す" })
    ).toBeVisible();
    const brandLink = page
      .locator('main a[href^="/shop/"]:not([href="/shop/search"])')
      .first();
    await expect(brandLink).toBeVisible();

    const brandHref = (await brandLink.getAttribute("href"))!;
    await brandLink.click();
    await expect(page).toHaveURL((url) => url.pathname === brandHref);
    await expect(
      page.locator(`main a[href^="${brandHref}/"]`).first()
    ).toBeVisible();
  });

  test("運営者でログインすると /admin が表示される", async ({ page }) => {
    await signInAs(page, ADMIN_EMAIL);

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "管理メニュー" })
    ).toBeVisible();
  });
});
