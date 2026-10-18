import { test, expect } from "../helpers/test-member";

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
