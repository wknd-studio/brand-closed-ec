import { test as base, type Browser, type Page } from "@playwright/test";
import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { CONTACT } from "@/app/legal/legal-notice";
import { test, expect } from "../helpers/test-member";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";

type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

/** users行と、その行に紐づけるサブスクリプションの状態（無ければ subscriptions 行を作らない） */
type MemberRowSpec = { user: UserInsert; subscriptionStatus?: string };

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GitHub issue #405: 入会済みの会員がオンボーディングの画面から送信・決済すると、
// プランや会員種別が書き換わったり、サブスクリプションが二重に作られたりするため、
// middlewareで /shop へ戻す
test.describe("入会済みの会員のオンボーディング画面へのアクセス", () => {
  for (const path of ["/onboarding/plan", "/onboarding/payment?plan=starter"]) {
    test(`${path} を開くと /shop へリダイレクトされる`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/shop/);
    });
  }
});

/** Clerkのuser.created Webhookが作る行を待つ時間の上限 */
const WEBHOOK_ROW_TIMEOUT_MS = 15_000;

/**
 * user.created Webhookがこのテストの接続先のDBに行を作るか。
 * Webhookの宛先はstgのアプリなので、stgのDBに繋いでいるとき（E2E Tests (stg)）だけ待つ。
 * PRのCIはローカルのDBを使い、Webhookは届かない
 */
function webhookWritesToThisDb(): boolean {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  return host !== "127.0.0.1" && host !== "localhost";
}

/**
 * Clerk上のテスト会員を用意する（前回の実行が中断されて残っていれば使い回す）。
 * 新しく作るとuser.created Webhookが飛び、届く環境ではそのClerkユーザーの有効なusers行が
 * 非同期に作られる。テストの行を入れた後に届くと前提が崩れるため、届くのを上限付きで待つ
 */
async function ensureClerkUser(email: string): Promise<string> {
  const clerkApi = await clerkClient();
  const { data } = await clerkApi.users.getUserList({ emailAddress: [email] });
  if (data[0]) return data[0].id;

  const created = await clerkApi.users.createUser({
    emailAddress: [email],
    // このインスタンスはパスワードが唯一の認証要素のため省略できない。
    // ログインはclerk.signInのサインイントークンで行うので乱数でよい
    password: `E2e-${crypto.randomUUID()}`,
    skipLegalChecks: true,
  });
  if (webhookWritesToThisDb()) {
    const deadline = Date.now() + WEBHOOK_ROW_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { data: rows } = await supabaseAdmin()
        .from("users")
        .select("id")
        .eq("clerk_user_id", created.id);
      if ((rows ?? []).length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return created.id;
}

/** このClerkユーザーのusers行をすべて消す（Webhookが作った行を含む） */
async function deleteUserRows(clerkUserId: string): Promise<void> {
  const { data: users } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  await supabaseAdmin()
    .from("subscriptions")
    .delete()
    .in(
      "user_id",
      (users ?? []).map((user) => user.id)
    );
  const { error } = await supabaseAdmin()
    .from("users")
    .delete()
    .eq("clerk_user_id", clerkUserId);
  if (error) {
    throw new Error(`テスト会員行の削除に失敗しました: ${error.message}`);
  }
}

/**
 * users行（とsubscriptions行）を直接用意したClerkユーザーでログインする。middlewareは
 * users.deleted_at・onboarding_completedと、解約済みでないsubscriptions行の有無（#380）だけを
 * 見るため、退会時のClerkユーザー削除が失敗してセッションが
 * 残った状態（src/use-cases/withdraw.ts が許容している）を、Clerkユーザーを残したまま
 * users行に deleted_at を入れることで再現できる
 */
async function signInWithUserRows(
  browser: Browser,
  baseURL: string | undefined,
  email: string,
  rows: (clerkUserId: string) => MemberRowSpec[]
): Promise<Page> {
  const clerkUserId = await ensureClerkUser(email);
  // 前回の実行で残った行や、user.created Webhookが作った行を消してから、このテストの行だけを入れる
  await deleteUserRows(clerkUserId);
  for (const [index, spec] of rows(clerkUserId).entries()) {
    const { data: user, error } = await supabaseAdmin()
      .from("users")
      .insert(spec.user)
      .select("id")
      .single();
    if (error) {
      throw new Error(`テスト会員行の作成に失敗しました: ${error.message}`);
    }
    if (!spec.subscriptionStatus) continue;
    const now = new Date();
    const { error: subscriptionError } = await supabaseAdmin()
      .from("subscriptions")
      .insert({
        user_id: user.id,
        stripe_customer_id: `cus_e2e_guard_${user.id}`,
        stripe_subscription_id: `sub_e2e_guard_${user.id}_${index}`,
        status: spec.subscriptionStatus,
        rank_code: "starter",
        current_period_start: now.toISOString(),
        current_period_end: new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(),
      });
    if (subscriptionError) {
      throw new Error(
        `テスト会員のサブスクリプションの作成に失敗しました: ${subscriptionError.message}`
      );
    }
  }

  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  return page;
}

function memberRow(
  clerkUserId: string,
  email: string,
  overrides: Partial<UserInsert>
): UserInsert {
  return {
    clerk_user_id: clerkUserId,
    email,
    last_name: "テスト",
    first_name: "太郎",
    phone_number: "09012345678",
    rank_code: "starter",
    member_type: "individual",
    onboarding_completed: true,
    billing_anchor_day: Math.min(new Date().getDate(), 28),
    ...overrides,
  };
}

base.describe.serial("退会済みの会員", () => {
  let email: string;
  let page: Page;

  base.beforeAll(async ({ browser }, workerInfo) => {
    email = slotEmail(
      `info+clerk_test_guard_withdrawn_w${workerInfo.parallelIndex}@wknd-studio.com`
    );
    page = await signInWithUserRows(
      browser,
      workerInfo.project.use.baseURL,
      email,
      // 退会でStripeのサブスクリプションも解約済み。利用停止より退会の判定を先に行う（#380）
      (id) => [
        {
          user: memberRow(id, email, {
            deleted_at: new Date().toISOString(),
          }),
          subscriptionStatus: "canceled",
        },
      ]
    );
  });

  base.afterAll(async () => {
    await page?.context().close();
    await cleanupTestUser(email);
  });

  for (const path of [
    "/onboarding/account-type",
    "/onboarding/plan",
    "/onboarding/payment?plan=starter",
    "/shop",
  ]) {
    base(`${path} を開くと /withdrawn へリダイレクトされる`, async () => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/withdrawn$/);
    });
  }

  // GitHub issue #493: SignOutButtonのエラーで画面ごと表示できず、退会した会員がログアウトできなかった。
  // ログアウトするので、このグループの最後に置く
  base(
    "/withdrawn に退会完了の案内が表示され、トップへ戻るとログアウトして / へ移動する",
    async () => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.goto("/withdrawn");
      await expect(
        page.getByRole("heading", { name: "退会が完了しました" })
      ).toBeVisible();
      await page.getByRole("button", { name: "トップへ戻る" }).click();
      await expect(page).toHaveURL(/\/$/);
      // ログアウトしたので、保護されたページを開くとサインインへ戻される
      await page.goto("/shop");
      await expect(page).toHaveURL(/\/sign-in/);
      expect(pageErrors).toEqual([]);
    }
  );
});

// clerk_user_idの一意制約は deleted_at IS NULL の部分インデックスのため、同じClerkユーザーの
// 退会済み行と有効な行が併存しうる。middlewareは有効な行で判定する
base.describe.serial("退会済み行と入会済みの有効な行が併存する会員", () => {
  let email: string;
  let page: Page;

  base.beforeAll(async ({ browser }, workerInfo) => {
    email = slotEmail(
      `info+clerk_test_guard_coexist_w${workerInfo.parallelIndex}@wknd-studio.com`
    );
    page = await signInWithUserRows(
      browser,
      workerInfo.project.use.baseURL,
      email,
      (id) => [
        {
          user: memberRow(id, email, {
            deleted_at: new Date().toISOString(),
          }),
          subscriptionStatus: "canceled",
        },
        { user: memberRow(id, email, {}), subscriptionStatus: "active" },
      ]
    );
  });

  base.afterAll(async () => {
    await page?.context().close();
    await cleanupTestUser(email);
  });

  base(
    "/shop を開ける（/withdrawn・オンボーディングへ飛ばされない）",
    async () => {
      await page.goto("/shop");
      await expect(page).toHaveURL(/\/shop$/);
    }
  );

  base(
    "/onboarding/plan を開くと有効な行で入会済みと判定され /shop へリダイレクトされる",
    async () => {
      await page.goto("/onboarding/plan");
      await expect(page).toHaveURL(/\/shop$/);
    }
  );
});

// GitHub issue #380: 再請求が尽きて Stripe がサブスクリプションを解約した（canceled）会員は、
// ログインはできるが、会員画面のどこを開いても利用停止の案内画面だけを表示する
base.describe.serial("Stripe 側でサブスクリプションが解約された会員", () => {
  let email: string;
  let page: Page;

  base.beforeAll(async ({ browser }, workerInfo) => {
    email = slotEmail(
      `info+clerk_test_guard_subscription_ended_w${workerInfo.parallelIndex}@wknd-studio.com`
    );
    page = await signInWithUserRows(
      browser,
      workerInfo.project.use.baseURL,
      email,
      (id) => [
        { user: memberRow(id, email, {}), subscriptionStatus: "canceled" },
      ]
    );
  });

  base.afterAll(async () => {
    await page?.context().close();
    await cleanupTestUser(email);
  });

  for (const path of ["/shop", "/settings", "/onboarding/plan"]) {
    base(
      `${path} を開くと /subscription-ended へリダイレクトされる`,
      async () => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/subscription-ended$/);
      }
    );
  }

  base(
    "/subscription-ended に契約の終了・注文と閲覧ができないこと・運営の連絡先が表示される",
    async () => {
      await page.goto("/subscription-ended");
      await expect(
        page.getByRole("heading", { name: "ご契約が終了しました" })
      ).toBeVisible();
      await expect(
        page.getByText("商品の閲覧・ご注文はできません", { exact: false })
      ).toBeVisible();
      await expect(
        page.getByText("ご利用の再開・退会をご希望の場合")
      ).toBeVisible();
      await expect(page.getByText(CONTACT.email.text)).toBeVisible();
    }
  );
});

// 支払い失敗中（past_due）は Stripe が再請求している間のため、画面の利用は止めない（新規注文の停止は #378）
base.describe.serial("支払い失敗中（past_due）の会員", () => {
  let email: string;
  let page: Page;

  base.beforeAll(async ({ browser }, workerInfo) => {
    email = slotEmail(
      `info+clerk_test_guard_past_due_w${workerInfo.parallelIndex}@wknd-studio.com`
    );
    page = await signInWithUserRows(
      browser,
      workerInfo.project.use.baseURL,
      email,
      (id) => [
        { user: memberRow(id, email, {}), subscriptionStatus: "past_due" },
      ]
    );
  });

  base.afterAll(async () => {
    await page?.context().close();
    await cleanupTestUser(email);
  });

  base("/shop を開ける（利用停止の画面へ飛ばされない）", async () => {
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/shop$/);
  });

  base(
    "/subscription-ended を開くと利用停止ではないため /shop へリダイレクトされる",
    async () => {
      await page.goto("/subscription-ended");
      await expect(page).toHaveURL(/\/shop$/);
    }
  );
});
