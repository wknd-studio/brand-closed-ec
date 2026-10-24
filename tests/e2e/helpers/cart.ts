import { expect, type Page } from "@playwright/test";
import { COOKIE_NAME, parseCart } from "@/lib/cart/cookie";

async function cartQuantity(page: Page): Promise<number> {
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === COOKIE_NAME
  );
  return parseCart(cookie?.value).items.reduce((sum, i) => sum + i.quantity, 0);
}

/**
 * 商品詳細ページで「カートに追加」を押し、カートに入ったことを確かめる。
 * ボタンはクライアントコンポーネントのため、ハイドレーション前に押すと何も起きない。
 * カート（Cookie）の数量が増えるまで押し直す。押す前に数量を確かめ直すことで、
 * 前のクリックが遅れて反映された場合に二重に追加しない。
 * actionTimeoutを設定していないため、clickとtoPassには上限を明示する（上限なしで待たない）
 */
export async function clickAddToCart(page: Page): Promise<void> {
  const before = await cartQuantity(page);
  await expect(async () => {
    if ((await cartQuantity(page)) > before) return;
    await page
      .getByRole("button", { name: "カートに追加", exact: true })
      .click({ timeout: 5000 });
    expect(await cartQuantity(page)).toBeGreaterThan(before);
  }).toPass({ timeout: 15000 });
}
