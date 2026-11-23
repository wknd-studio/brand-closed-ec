import { test, expect } from "@playwright/test";

/**
 * 利用規約・プライバシーポリシー・特定商取引法に基づく表記は、販売の前に誰でも読める必要がある
 * （特定商取引法第11条）。未ログインのまま、全ページ共通のフッターから3つとも開けることを確かめる（#695）
 */
test.describe("法的表記のページ", () => {
  const pages = [
    { link: "利用規約", heading: "利用規約", path: "/legal/terms" },
    {
      link: "プライバシーポリシー",
      heading: "プライバシーポリシー",
      path: "/legal/privacy",
    },
    {
      link: "特定商取引法に基づく表記",
      heading: "特定商取引法に基づく表記",
      path: "/legal/tokushoho",
    },
  ];

  for (const { link, heading, path } of pages) {
    test(`未ログインでトップのフッターから「${link}」を開ける`, async ({
      page,
    }) => {
      await page.goto("/");
      await page
        .getByRole("contentinfo")
        .getByRole("link", { name: link })
        .click();

      await expect(page).toHaveURL((url) => url.pathname === path);
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible();
    });
  }

  test("特定商取引法に基づく表記に、第11条で求められる項目が並ぶ", async ({
    page,
  }) => {
    await page.goto("/legal/tokushoho");

    for (const term of [
      "販売業者",
      "運営統括責任者",
      "所在地",
      "電話番号",
      "メールアドレス",
      "販売価格",
      "商品代金以外の必要料金",
      "支払方法",
      "支払時期",
      "引渡時期",
      "返品・交換・キャンセル",
    ]) {
      await expect(
        page.getByRole("term").filter({ hasText: term })
      ).toHaveCount(1);
    }
  });
});
