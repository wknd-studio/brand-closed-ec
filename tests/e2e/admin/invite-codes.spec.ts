import { clerk } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

test.describe.serial("管理者操作", () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD が未設定のためスキップ"
  );

  let preTestIds: string[] = [];

  test.beforeAll(async () => {
    const { data } = await adminClient().from("invitation_codes").select("id");
    preTestIds = (data ?? []).map((r) => r.id);
  });

  test.afterAll(async () => {
    const client = adminClient();
    if (preTestIds.length > 0) {
      await client
        .from("invitation_codes")
        .delete()
        .not("id", "in", `(${preTestIds.join(",")})`);
    } else {
      await client.from("invitation_codes").delete().not("id", "is", null);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_ADMIN_EMAIL!,
    });
  });

  test.afterEach(async ({ page }) => {
    await clerk.signOut({ page });
  });

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
    await expect(page.locator("table")).toBeVisible();

    // colSpan を持つ「コードがありません」行を除いた実データ行のみカウント
    const beforeCount = await page
      .locator("tbody tr:not(:has(td[colspan]))")
      .count();

    await page.getByRole("button", { name: "コードを発行" }).click();
    await page.getByLabel("最大使用回数").fill("3");
    await page.getByRole("button", { name: "発行する" }).click();

    await expect(page.getByText("招待コードを発行しました")).toBeVisible();
    await expect(page.locator("tbody tr:not(:has(td[colspan]))")).toHaveCount(
      beforeCount + 1
    );
  });

  test("発行済みコードをクリップボードにコピーできる", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/admin/invite-codes");

    // コードを1件発行してからコピーをテスト
    await page.getByRole("button", { name: "コードを発行" }).click();
    await page.getByRole("button", { name: "発行する" }).click();
    await expect(page.getByText("招待コードを発行しました")).toBeVisible();

    await page.getByRole("button", { name: "コピー" }).first().click();
    await expect(page.getByText("コピーしました")).toBeVisible();
  });
});
