import { expect, type Page } from "@playwright/test";

/**
 * 商品詳細ページで「カートに追加」を押し、カートに入ったことを確かめる。
 * ボタンはクライアントコンポーネントのため、ハイドレーション前に押すと何も起きない。
 * 「カートに追加しました」の表示（2秒で元に戻る）が出るまで押し直す。
 * actionTimeoutを設定していないため、clickとtoPassには上限を明示する（上限なしで待たない）
 */
export async function clickAddToCart(page: Page): Promise<void> {
  await expect(async () => {
    await page
      .getByRole("button", { name: "カートに追加", exact: true })
      .click({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: /カートに追加しました/ })
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}
