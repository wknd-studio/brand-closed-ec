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
  // 3つの文書を行き来するナビ（#838）。パソコン幅は左に、スマホ幅は上にタブで出す
  for (const viewport of [
    { name: "パソコン幅", width: 1280, height: 900 },
    { name: "スマホ幅", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}で、文書のナビの今の文書に aria-current="page" が付く`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);

      for (const { link, path } of pages) {
        await page.goto(path);
        const nav = page.getByRole("navigation", { name: "文書の切り替え" });

        for (const other of pages) {
          const item = nav.getByRole("link", { name: other.link, exact: true });
          await expect(item).toBeVisible();
          if (other.link === link) {
            await expect(item).toHaveAttribute("aria-current", "page");
          } else {
            await expect(item).not.toHaveAttribute("aria-current", /.*/);
          }
        }
      }
    });
  }

  test("文書のナビから別の文書へ移れる", async ({ page }) => {
    await page.goto("/legal/terms");
    await page
      .getByRole("navigation", { name: "文書の切り替え" })
      .getByRole("link", { name: "特定商取引法に基づく表記", exact: true })
      .click();

    await expect(page).toHaveURL((url) => url.pathname === "/legal/tokushoho");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "特定商取引法に基づく表記",
      })
    ).toBeVisible();
  });

  test("利用規約は条ごとに見出しが付き、仮の条に「要差し替え」が出る", async ({
    page,
  }) => {
    await page.goto("/legal/terms");

    const headings = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(headings).toHaveText([
      "第1条（目的）",
      "第2条（会員資格）",
      "第3条（禁止事項）",
      /^第4条（最低利用期間・退会）\s*要差し替え$/,
      "第5条（免責事項）",
      "第6条（規約の変更）",
    ]);

    const prohibited = page.getByRole("region", { name: "第3条（禁止事項）" });
    await expect(prohibited.getByRole("listitem")).toHaveText([
      "招待の第三者への無断譲渡",
      "本サービスの不正利用",
      "その他当社が不適切と判断する行為",
    ]);
  });

  test("プライバシーポリシーは条ごとに見出しが付き、段落と箇条書きに分かれる", async ({
    page,
  }) => {
    await page.goto("/legal/privacy");

    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 })
    ).toHaveText([
      "第1条（取得する情報）",
      "第2条（利用目的）",
      "第3条（第三者提供）",
      "第4条（安全管理措置）",
      "第5条（開示・訂正・削除等の請求）",
      "第6条（本ポリシーの変更）",
    ]);

    const collected = page.getByRole("region", {
      name: "第1条（取得する情報）",
    });
    await expect(collected.getByRole("paragraph")).toHaveText([
      "当社は、本サービスの提供にあたり、以下の情報を取得します。",
    ]);
    await expect(collected.getByRole("listitem")).toHaveCount(5);

    const thirdParty = page.getByRole("region", {
      name: "第3条（第三者提供）",
    });
    await expect(thirdParty.getByRole("paragraph")).toHaveCount(2);
  });

  test("特定商取引法に基づく表記の仮の値に「要差し替え」が出る", async ({
    page,
  }) => {
    await page.goto("/legal/tokushoho");

    const seller = page
      .getByRole("term")
      .filter({ hasText: "販売業者" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(seller).toHaveText(/株式会社○○\s*要差し替え/);

    const price = page
      .getByRole("term")
      .filter({ hasText: "販売価格" })
      .locator("xpath=following-sibling::dd[1]");
    await expect(price).not.toContainText("要差し替え");
  });
});
