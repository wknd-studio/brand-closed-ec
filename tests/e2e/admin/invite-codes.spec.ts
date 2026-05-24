import { test, expect } from "@playwright/test";

test.describe("未認証アクセス", () => {
  test("GET /admin/invite-codes → サインインページへリダイレクト", async ({
    page,
  }) => {
    await page.goto("/admin/invite-codes");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("GET /api/admin/invite-codes → 401", async ({ request }) => {
    const res = await request.get("/api/admin/invite-codes");
    expect(res.status()).toBe(401);
  });

  test("POST /api/admin/invite-codes → 401", async ({ request }) => {
    const res = await request.post("/api/admin/invite-codes", {
      data: { maxUses: 1, expiresAt: null },
    });
    expect(res.status()).toBe(401);
  });
});

// 管理者操作テストは Clerk テスト用トークンが必要なため
// CLERK_TEST_ADMIN_TOKEN が設定されていない環境ではスキップ
test.describe("管理者操作", () => {
  test.skip(
    !process.env.CLERK_TEST_ADMIN_TOKEN,
    "CLERK_TEST_ADMIN_TOKEN が未設定のためスキップ"
  );

  test("招待コード管理ページが表示される", async ({ page }) => {
    await page.goto("/admin/invite-codes");
    await expect(
      page.getByRole("heading", { name: "招待コード管理" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "コードを発行" })
    ).toBeVisible();
  });

  test("招待コードを発行すると一覧に追加される", async ({ page }) => {
    await page.goto("/admin/invite-codes");

    const beforeCount = await page.getByRole("row").count();

    await page.getByRole("button", { name: "コードを発行" }).click();
    await page.getByLabel("最大使用回数").fill("3");
    await page.getByRole("button", { name: "発行する" }).click();

    await expect(page.getByText("招待コードを発行しました")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(beforeCount + 1);
  });

  test("発行済みコードをクリップボードにコピーできる", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/admin/invite-codes");

    await page.getByRole("button", { name: "コピー" }).first().click();
    await expect(page.getByText("コピーしました")).toBeVisible();
  });
});
