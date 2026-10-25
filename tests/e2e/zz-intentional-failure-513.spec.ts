import { test, expect } from "@playwright/test";

// #513 の確認用。Playwrightのレポートが暗号化されてアップロードされることを確かめるため、わざと失敗させる。
// マージ前に必ずrevertする
test("わざと失敗させる（#513 の確認用・マージ前に戻す）", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText(
    "この文字列はどこにも無い-513"
  );
});
