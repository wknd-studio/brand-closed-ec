import { test as base, type Browser, type Page } from "@playwright/test";
import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect } from "../helpers/test-member";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";

type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

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

/**
 * users行を直接用意したClerkユーザーでログインする。middlewareはusers.deleted_at・
 * onboarding_completedだけを見るため、退会時のClerkユーザー削除が失敗してセッションが
 * 残った状態（src/use-cases/withdraw.ts が許容している）を、Clerkユーザーを残したまま
 * users行に deleted_at を入れることで再現できる
 */
async function signInWithUserRows(
  browser: Browser,
  baseURL: string | undefined,
  email: string,
  rows: (clerkUserId: string) => UserInsert[]
): Promise<Page> {
  // 前回の実行が中断されて残った会員を消してから作り直す
  await cleanupTestUser(email);

  const clerkApi = await clerkClient();
  const created = await clerkApi.users.createUser({
    emailAddress: [email],
    // このインスタンスはパスワードが唯一の認証要素のため省略できない。
    // ログインはclerk.signInのサインイントークンで行うので乱数でよい
    password: `E2e-${crypto.randomUUID()}`,
    skipLegalChecks: true,
  });

  const { error } = await supabaseAdmin()
    .from("users")
    .insert(rows(created.id));
  if (error) {
    throw new Error(`テスト会員行の作成に失敗しました: ${error.message}`);
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
      (clerkUserId) => [
        memberRow(clerkUserId, email, {
          deleted_at: new Date().toISOString(),
        }),
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
      (clerkUserId) => [
        memberRow(clerkUserId, email, {
          deleted_at: new Date().toISOString(),
        }),
        memberRow(clerkUserId, email, {}),
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
