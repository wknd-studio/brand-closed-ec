import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestInvitation,
  cleanupTestUser,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = "info+clerk_test_checkout@wknd-studio.com";
const TEST_PASSWORD = "TestPassw0rd!12345";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Stripeのホスト画面（Checkout）は自動テストを防ぐボット検知の対象であり
 * 実際の決済操作は行わない（research.md参照）。オンボーディング自体は
 * specs/002-e2e-auth-coverageで別途検証済みのため、本テストの前提として
 * 必要な「オンボーディング完了済み会員」はDBへ直接書き込んで作る。
 *
 * usersテーブルの行は本来Clerkのuser.createdイベントのWebhook経由で作成されるが、
 * このWebhookはClerk側から実際にネットワーク到達可能なエンドポイント（ngrokトンネル等）
 * にしか配信されず、ローカルの`task dev:ngrok`やCI環境では届かない
 * （Stripeのホスト画面と同様、外部サービスからのWebhook配信自体はE2Eで信頼しない）。
 * そのため、Webhookの到着を待つのではなく、この行自体をテスト側で直接作成する。
 *
 * clerk_user_idは、Clerkの検索API（getUserListのメールアドレス絞り込み）ではなく、
 * 実際に認証済みのセッションが持つClerkのセッションCookie（`__session`。Clerkの
 * サーバー側`auth()`ヘルパーが読んでいるものと同一）のJWTから直接取り出す。
 * 検索APIは新規作成直後のユーザーが即座に反映される保証がある確証を得られておらず、
 * CI環境でこの行のclerk_user_idと実際にサインインしているセッションのIDが一致せず
 * ミドルウェアがオンボーディング未完了と判定してしまう不具合が発生した。
 * セッションCookie自体を読む方式であれば、ミドルウェアが見るものと100%一致する。
 */
function decodeClerkUserIdFromSessionCookie(
  sessionCookieValue: string
): string {
  const payload = sessionCookieValue.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf-8");
  const claims = JSON.parse(json) as { sub: string };
  return claims.sub;
}

async function registerAndMarkOnboarded(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });

  const invitationUrl = await createTestInvitation(TEST_EMAIL);
  await page.goto(invitationUrl);

  await expect(page.getByRole("heading", { name: "利用規約" })).toBeVisible();
  await page.getByLabel("利用規約に同意する").check();
  await page.getByRole("button", { name: "同意してアカウントを作成" }).click();

  await expect(page).toHaveURL(/\/sign-up/);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/plan/);

  const cookies = await page.context().cookies();
  // デバッグ調査用（CI原因究明のため一時的に追加。原因判明後に削除する）
  console.log("[debug] cookies:", cookies.map((c) => c.name).join(", "));
  const sessionCookie = cookies.find((c) => c.name === "__session");
  if (!sessionCookie) {
    throw new Error("セッションCookie（__session）が見つかりませんでした");
  }
  const clerkUserId = decodeClerkUserIdFromSessionCookie(sessionCookie.value);
  console.log("[debug] clerkUserId from cookie:", clerkUserId);

  const { error, data: insertedRows } = await supabaseAdmin()
    .from("users")
    .insert({
      clerk_user_id: clerkUserId,
      email: TEST_EMAIL,
      rank: "starter",
      onboarding_completed: true,
      subscribed_at: new Date().toISOString(),
    })
    .select("id, clerk_user_id, onboarding_completed");
  if (error) {
    throw new Error(`テスト用会員行の作成に失敗しました: ${error.message}`);
  }
  console.log("[debug] inserted row:", JSON.stringify(insertedRows));

  await page.goto("/shop");
  console.log("[debug] after /shop goto, url:", page.url());

  if (page.url().includes("/onboarding")) {
    const { data: recheck } = await supabaseAdmin()
      .from("users")
      .select("*")
      .eq("clerk_user_id", clerkUserId);
    console.log(
      "[debug] recheck by clerk_user_id after redirect:",
      JSON.stringify(recheck)
    );
    const postCookies = await page.context().cookies();
    const postSession = postCookies.find((c) => c.name === "__session");
    console.log(
      "[debug] clerkUserId from cookie AFTER redirect:",
      postSession
        ? decodeClerkUserIdFromSessionCookie(postSession.value)
        : "(none)"
    );
  }
}

async function addFirstProductToCart(page: Page): Promise<void> {
  await page.goto("/shop");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("link", { name: /GUCCI/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/shop/GUCCI/"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "カートに追加" }).click();
}

async function fillNewAddress(
  page: Page,
  addressType: "お届け先" | "請求先"
): Promise<void> {
  const buttonIndex = addressType === "お届け先" ? 0 : 1;
  await page
    .getByRole("button", { name: "＋ 新規登録" })
    .nth(buttonIndex)
    .click();
  await page.locator('input[name="recipient_last_name"]').fill("テスト");
  await page.locator('input[name="recipient_first_name"]').fill("太郎");
  await page.locator('input[name="postal_code"]').fill("1000001");
  await page.locator('select[name="prefecture"]').selectOption("東京都");
  await page.locator('input[name="city"]').fill("千代田区");
  await page.locator('input[name="address_line1"]').fill("丸の内1-1-1");
  await page.locator('input[name="phone_number"]').fill("09012345678");
  await page.getByRole("button", { name: "保存" }).click();
  await page.waitForTimeout(1000);
}

async function getTestUserId(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq("email", TEST_EMAIL)
    .single();
  return data!.id;
}

// 3つのテストが同じメールアドレス（TEST_EMAIL）を使い回すため、並列実行での競合を避けるために直列実行する
test.describe.serial("実際のカタログ〜チェックアウト画面遷移フロー", () => {
  test.afterEach(async ({ page }) => {
    // Stripeの外部ドメインに遷移したままだと後続処理が失敗するため、自アプリのドメインに戻す
    await page.goto("/");
    await cleanupTestUser(TEST_EMAIL);
  });

  test("登録済み住所がない会員が新規入力した住所で注文を確定すると、Stripe Checkout画面へ遷移する", async ({
    page,
  }) => {
    await registerAndMarkOnboarded(page);
    await addFirstProductToCart(page);

    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    await fillNewAddress(page, "お届け先");
    await page.getByRole("radio", { name: /テスト 太郎/ }).check();
    await page.getByRole("checkbox", { name: "お届け先と同じ" }).check();

    await page.getByRole("button", { name: "注文を確定する" }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });
  });

  test("登録済み住所がある会員が既存住所を選択して注文を確定すると、Stripe Checkout画面へ遷移する", async ({
    page,
  }) => {
    await registerAndMarkOnboarded(page);

    const userId = await getTestUserId();
    await supabaseAdmin()
      .from("addresses")
      .insert([
        {
          user_id: userId,
          type: "shipping",
          recipient_last_name: "テスト",
          recipient_first_name: "花子",
          postal_code: "1500001",
          prefecture: "東京都",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          phone_number: "09098765432",
          is_default: true,
        },
        {
          user_id: userId,
          type: "billing",
          recipient_last_name: "テスト",
          recipient_first_name: "花子",
          postal_code: "1500001",
          prefecture: "東京都",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          phone_number: "09098765432",
          is_default: true,
        },
      ]);

    await addFirstProductToCart(page);
    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    await page
      .getByRole("radio", { name: /テスト 花子/ })
      .first()
      .check();

    await page.getByRole("button", { name: "注文を確定する" }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });
  });

  test("月次仕入れ上限を超える注文は確定できず、Stripe Checkout画面へ遷移しない", async ({
    page,
  }) => {
    await registerAndMarkOnboarded(page);
    const userId = await getTestUserId();

    // カート追加時点ではまだ確定済み金額がないため、
    // カートへの追加自体（クライアント側の月次上限チェック）はブロックされない。
    // 「注文を確定する」操作時のサーバー側チェック（checkMonthlyLimit）を
    // 検証したいので、上限超過となる確定済み注文はカート追加の後に作成する
    await addFirstProductToCart(page); // GG Marmontコンパクトウォレット ¥58,000

    // STARTERランクの月次上限は300,000円。既に290,000円分を確定済みにしておく
    await supabaseAdmin().from("orders").insert({
      id: "00000000-0000-0000-0000-000000000060",
      user_id: userId,
      payment_flow: "checkout",
      status: "paid",
      rank_at_order: "starter",
      monthly_limit_at_order: 300_000,
      shipping_address_snapshot: {},
      billing_address_snapshot: {},
    });
    await supabaseAdmin().from("order_items").insert({
      order_id: "00000000-0000-0000-0000-000000000060",
      sanity_product_id: "prod-limit-test",
      product_name_snapshot: "上限テスト用商品",
      unit_price_snapshot: 290_000,
      quantity: 1,
      is_negotiable: false,
    });

    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    await fillNewAddress(page, "お届け先");
    await page.getByRole("radio", { name: /テスト 太郎/ }).check();
    await page.getByRole("checkbox", { name: "お届け先と同じ" }).check();

    await page.getByRole("button", { name: "注文を確定する" }).click();

    await expect(page.getByText(/上限.*超える/)).toBeVisible();
    await expect(page).toHaveURL(/\/order\/checkout/);
    await expect(page).not.toHaveURL(/checkout\.stripe\.com/);

    const { data: orders } = await supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .neq("id", "00000000-0000-0000-0000-000000000060");
    expect(orders).toHaveLength(0);

    await supabaseAdmin()
      .from("order_items")
      .delete()
      .eq("order_id", "00000000-0000-0000-0000-000000000060");
    await supabaseAdmin()
      .from("orders")
      .delete()
      .eq("id", "00000000-0000-0000-0000-000000000060");
  });
});
