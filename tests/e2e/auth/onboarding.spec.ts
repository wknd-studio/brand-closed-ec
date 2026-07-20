import { clerk } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function clerkApiPatch(path: string, body: unknown) {
  await fetch(`https://api.clerk.com/v1${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function getClerkUserId(email: string): Promise<string> {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
  );
  const users = await res.json();
  return users[0].id;
}

// ── 未認証アクセス ─────────────────────────────────────────────

test.describe("未認証アクセス", () => {
  test("未認証で /onboarding/plan にアクセスすると /sign-in へリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/onboarding/plan");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ── 認証済みアクセス ───────────────────────────────────────────

test.describe.serial("認証済みアクセス", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "E2E_USER_EMAIL が未設定のためスキップ"
  );

  let clerkUserId: string;

  test.beforeAll(async () => {
    clerkUserId = await getClerkUserId(process.env.E2E_USER_EMAIL!);
  });

  test.afterAll(async () => {
    await supabaseAdmin()
      .from("users")
      .delete()
      .eq("clerk_user_id", clerkUserId);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_USER_EMAIL!,
    });
  });

  test.afterEach(async ({ page }) => {
    await clerk.signOut({ page });
    await clerkApiPatch(`/users/${clerkUserId}/metadata`, {
      public_metadata: { onboarding_completed: false },
    });
    await supabaseAdmin()
      .from("users")
      .delete()
      .eq("clerk_user_id", clerkUserId);
  });

  test("onboarding_completed=false のユーザーは /onboarding/plan へリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/onboarding\/plan/);
  });

  test("プラン選択 UI が表示される", async ({ page }) => {
    await page.goto("/onboarding/plan");
    await expect(
      page.getByRole("heading", { name: /プランを選択/ })
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: /STARTER/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /BASIC/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /STANDARD/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /PRO/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /ADVANCED/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /PREMIUM/ })).toBeVisible();
  });

  test("STARTER プランを選択すると Stripe Checkout へリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/onboarding/plan");
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);

    // Stripeの外部ドメインに遷移したままだとafterEachのclerk.signOut()が
    // 動作しないため、自アプリのドメインに戻しておく
    await page.goto("/");
  });
});
