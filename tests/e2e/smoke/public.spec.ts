import { test, expect } from "@playwright/test";

/**
 * デプロイした環境（環境変数・秘密鍵・Cloudflare Workers上のビルド・外部サービスの設定）が
 * 動いているかを、ログインせず・データを書き換えずに確かめる（#696）。
 * `pnpm test:e2e:smoke:public` で流す。stgでは deploy.yml の「環境の確認（スモークテスト）」で
 * ログインするもの（signed-in.spec.ts）と一緒に、本番では smoke-prod のジョブでこれだけを流す。
 *
 * 本番でも流すため、Clerkの開発用インスタンスでしか使えないTesting Token（`clerk.signIn`・`setupClerkTestingToken`）を使わない。
 * `BASE_URL` 以外の環境変数を読まない（playwright.config.ts の smoke-public のproject）。
 *
 * Webhookの受け口には、署名の正しくないリクエストを送る。受け口は署名検証の前に秘密鍵が無ければ
 * 例外を投げ（500）、署名が正しくなければSentryに送らずに400を返す。400が返れば、秘密鍵が設定され、
 * 署名検証まで届いていると分かる。テストからのリクエストだと分かるよう `x-smoke-test` を付ける
 */

// 受け口のログ等で、スモークテストからのリクエストだと分かるようにする
const SMOKE_HEADERS = { "x-smoke-test": "1" };

test.describe("スモークテスト（ログインしない）", { tag: "@smoke" }, () => {
  test("トップが表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("憧れ");
  });

  test("/waitlist にClerkのフォームが表示される", async ({ page }) => {
    await page.goto("/waitlist");
    // Clerkの<Waitlist>が描画されれば、ClerkのJSと公開鍵が読み込めている
    await expect(page.locator("#emailAddress-field")).toBeVisible();
  });

  test("/sign-in にClerkのフォームが表示される", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("#identifier-field")).toBeVisible();
  });

  test("未ログインで /shop を開くと /sign-in に飛ばされる", async ({
    page,
    baseURL,
  }) => {
    // middleware（clerkMiddleware）がClerkの秘密鍵でセッションを確かめられていれば、ログインに飛ばす。
    // サイト自身の /sign-in に飛ぶこと（NEXT_PUBLIC_CLERK_SIGN_IN_URL の設定忘れで、Clerkが用意する
    // 別ドメインのログイン画面に飛ばないこと）まで確かめる
    await page.goto("/shop");
    await expect(page).toHaveURL(
      (url) =>
        url.origin === new URL(baseURL!).origin &&
        url.pathname.startsWith("/sign-in")
    );
    await expect(page.locator("#identifier-field")).toBeVisible();
  });

  test("/legal/terms が表示される", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(
      page.getByRole("heading", { level: 1, name: "利用規約" })
    ).toBeVisible();
  });

  test("/legal/privacy が表示される", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(
      page.getByRole("heading", { level: 1, name: "プライバシーポリシー" })
    ).toBeVisible();
  });

  test("Stripe の Webhook の受け口が、署名の正しくないリクエストを 400 で拒否する", async ({
    request,
  }) => {
    const res = await request.post("/api/webhooks/stripe", {
      headers: { ...SMOKE_HEADERS, "stripe-signature": "t=0,v1=smoke-test" },
      data: "{}",
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "署名が不正です" });
  });

  test("Clerk の Webhook の受け口が、署名の正しくないリクエストを 400 で拒否する", async ({
    request,
  }) => {
    const res = await request.post("/api/webhooks/clerk", {
      headers: {
        ...SMOKE_HEADERS,
        "svix-id": "msg_smoke_test",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,smoke-test",
      },
      data: "{}",
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "署名が不正です" });
  });
});
