import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import type { Database } from "@/types/database.types";
import { slotEmail } from "../helpers/clerk-test-invitation";

const TEST_EMAIL = slotEmail(
  "info+clerk_test_onboarding_success@wknd-studio.com"
);

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * 決済完了画面（GitHub issue #407・#425）。入会の確定はStripe Webhookで非同期に行うため、
 * 画面は入会の確定（users.onboarding_completed=true）を待ってから/shopへ進む。
 * 確定待ちを表示するのは、URLのsession_idが本人の決済完了済みのCheckout Sessionの
 * ときだけで、決済していない会員が開いたときは種別選択へ戻す。
 *
 * 決済完了済みのセッションはStripeの決済画面を操作しないと作れないため、確定待ちの
 * 表示・他人のセッション・Stripe APIの失敗はユニットテスト
 * （tests/unit/onboarding-payment-success.test.ts）で確認する。
 *
 * Webhookの到着はDBの更新で代替する。画面での会員登録は経由せず、Clerkのユーザーを
 * Backend APIで作成し、決済直前の状態（onboarding_completed=false）のusers行を直接用意する
 */
test.describe.serial("決済完了画面", () => {
  let clerkUserId: string;

  test.beforeAll(async () => {
    const clerkApi = await clerkClient();
    const { data } = await clerkApi.users.getUserList({
      emailAddress: [TEST_EMAIL],
    });
    clerkUserId =
      data[0]?.id ??
      (
        await clerkApi.users.createUser({
          emailAddress: [TEST_EMAIL],
          // ログインはclerk.signInのサインイントークンで行うため、パスワードは乱数でよい
          password: `E2e-${crypto.randomUUID()}`,
          skipLegalChecks: true,
        })
      ).id;

    const supabase = supabaseAdmin();
    await supabase.from("users").delete().eq("clerk_user_id", clerkUserId);
    const { error } = await supabase.from("users").insert({
      clerk_user_id: clerkUserId,
      email: TEST_EMAIL,
      last_name: "テスト",
      first_name: "太郎",
      phone_number: "09012345678",
      rank_code: "starter",
      member_type: "individual",
      onboarding_completed: false,
      billing_anchor_day: Math.min(new Date().getDate(), 28),
    });
    if (error) {
      throw new Error(`テスト会員行の作成に失敗しました: ${error.message}`);
    }
  });

  test.afterAll(async () => {
    await supabaseAdmin()
      .from("users")
      .delete()
      .eq("clerk_user_id", clerkUserId);
    const clerkApi = await clerkClient();
    await clerkApi.users.deleteUser(clerkUserId).catch(() => {});
  });

  test("session_idを付けずに開くと、確定待ちを表示せず種別選択へ戻される", async ({
    page,
  }) => {
    // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: TEST_EMAIL });

    await page.goto("/onboarding/payment/success");
    await expect(page).toHaveURL(/\/onboarding\/account-type/);
  });

  test("決済が完了していない本人のセッションで開くと、種別選択へ戻される", async ({
    page,
  }) => {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_IDS.starter.monthly, quantity: 1 }],
      success_url: "https://example.com/success",
      metadata: { clerk_user_id: clerkUserId, plan: "starter" },
    });

    try {
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: TEST_EMAIL });

      await page.goto(`/onboarding/payment/success?session_id=${session.id}`);
      await expect(page).toHaveURL(/\/onboarding\/account-type/);
    } finally {
      await stripe.checkout.sessions.expire(session.id);
    }
  });

  test("入会済みなら /shop へ進む", async ({ page }) => {
    const { error } = await supabaseAdmin()
      .from("users")
      .update({ onboarding_completed: true })
      .eq("clerk_user_id", clerkUserId);
    expect(error).toBeNull();

    await page.goto("/");
    await clerk.signIn({ page, emailAddress: TEST_EMAIL });

    await page.goto("/onboarding/payment/success");
    await expect(page).toHaveURL(/\/shop/);
  });
});
