import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  signUpViaInvitation,
  cleanupTestUser,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = "info+clerk_test_org_signup@wknd-studio.com";
const TEST_PASSWORD = "TestPassw0rd!12345";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function cleanupTestOrganization(name: string) {
  const supabase = supabaseAdmin();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (org) {
    await supabase
      .from("organization_memberships")
      .delete()
      .eq("organization_id", org.id);
    await supabase.from("organizations").delete().eq("id", org.id);
  }
}

// quickstart.md シナリオ1: 代表者のセルフサインアップによる法人組織作成
test.describe("法人セルフサインアップ", () => {
  const organizationName = "E2Eテスト株式会社";

  test.afterEach(async ({ page }) => {
    await page.goto("/");
    await cleanupTestOrganization(organizationName);
    await cleanupTestUser(TEST_EMAIL);
  });

  test("法人として登録し、不正な形式のインボイス番号はブロックされ、正しい形式で組織が作成される", async ({
    page,
  }) => {
    await signUpViaInvitation(page, TEST_EMAIL, TEST_PASSWORD);

    // Clerk Dashboard側の「サインアップ後の遷移先」が/onboarding/planを指しているため
    // （clerk-test-invitation.tsのコメント参照）、法人登録を選ぶにはここから
    // 明示的に/onboarding/account-typeへ遷移する
    await page.goto("/onboarding/account-type");
    await page.getByRole("radio", { name: /法人として登録/ }).check();
    await page.getByRole("button", { name: /次へ/ }).click();

    await expect(page).toHaveURL(/\/onboarding\/organization/);

    await page.locator('input[name="organizationName"]').fill(organizationName);
    await page.locator('input[name="representativeName"]').fill("山田太郎");
    await page.locator('input[name="phoneNumber"]').fill("0312345678");
    await page.locator('input[name="postalCode"]').fill("1000001");
    await page.locator('input[name="prefecture"]').fill("東京都");
    await page.locator('input[name="city"]').fill("千代田区");
    await page.locator('input[name="addressLine1"]').fill("1-1-1");

    // 不正な形式（"T"なしの数字13桁のみ）はHTML側のpattern検証でブロックされる
    await page
      .locator('input[name="invoiceRegistrationNumber"]')
      .fill("1234567890123");
    await page.getByRole("button", { name: "組織を作成する" }).click();
    await expect(page).toHaveURL(/\/onboarding\/organization/);

    await page
      .locator('input[name="invoiceRegistrationNumber"]')
      .fill("T1234567890123");
    await page.getByRole("button", { name: "組織を作成する" }).click();

    await expect(page).toHaveURL(/\/onboarding\/plan\?organizationId=/);

    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(page).toHaveURL("/");

    const { data: organization } = await supabaseAdmin()
      .from("organizations")
      .select("id, rank, onboarding_completed")
      .eq("name", organizationName)
      .single();
    expect(organization).not.toBeNull();
    expect(organization!.rank).toBe("starter");
    expect(organization!.onboarding_completed).toBe(true);

    const { data: memberships } = await supabaseAdmin()
      .from("organization_memberships")
      .select("clerk_role")
      .eq("organization_id", organization!.id);
    expect(memberships).toHaveLength(1);
    expect(memberships![0].clerk_role).toBe("org:admin");
  });
});
