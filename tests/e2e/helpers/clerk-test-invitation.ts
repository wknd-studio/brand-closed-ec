import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getClerkUserIdByEmail(
  email: string
): Promise<string | undefined> {
  const clerk = await clerkClient();
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });
  return data[0]?.id;
}

async function revokePendingInvitationsForEmail(email: string) {
  const clerk = await clerkClient();
  const { data: pendingInvitations } =
    await clerk.invitations.getInvitationList({ status: "pending" });
  for (const invitation of pendingInvitations) {
    if (invitation.emailAddress !== email) continue;
    // 招待はメール送信完了などで先方状態が変わり取消不能(400)になることがあるため、
    // ベストエフォートで取消を試み、失敗してもクリーンアップ全体は継続する
    await clerk.invitations.revokeInvitation(invitation.id).catch(() => {});
  }
}

export async function createTestInvitation(emailAddress: string) {
  const clerk = await clerkClient();

  const existingUserId = await getClerkUserIdByEmail(emailAddress);
  if (existingUserId) {
    await clerk.users.deleteUser(existingUserId);
  }

  await revokePendingInvitationsForEmail(emailAddress);

  const invitation = await clerk.invitations.createInvitation({
    emailAddress,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/sign-up`,
    ignoreExisting: true,
    notify: false, // テスト用招待のためメール送信を止める。invitation.url を直接使うので通知不要
  });

  if (!invitation.url) {
    throw new Error(`招待URLの発行に失敗しました: ${emailAddress}`);
  }

  return invitation.url;
}

/**
 * 招待受諾→パスワード設定までの、実際の画面操作を伴う新規会員登録フロー
 * （`registration.spec.ts`等で重複していた処理を共通化）。
 * 利用規約・プライバシーポリシーへの同意はClerk標準のLegal Consent機能
 * （サインアップフォーム内のチェックボックス）で行う。
 * 完了時点でサインイン済み・オンボーディング未完了（/onboarding/account-type）の状態になる
 * （next.config.tsのNEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URLで指定）。
 */
export async function signUpViaInvitation(
  page: Page,
  emailAddress: string,
  password: string
): Promise<void> {
  await setupClerkTestingToken({ page });

  const invitationUrl = await createTestInvitation(emailAddress);
  await page.goto(invitationUrl);

  await expect(page).toHaveURL(/\/sign-up/);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByLabel(/I agree to the Terms of Service and Privacy Policy/)
    .check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/account-type/);
}

/**
 * `signUpViaInvitation`に加え、個人/法人選択画面で「個人として登録」を選び
 * /onboarding/planまで進める（個人向けの各E2Eテストの共通前段）。
 * 個人登録時のプラン選択画面には氏名・電話番号の必須入力欄があるため、
 * ここで埋めておき、以降のプラン選択を即座に送信できる状態にする。
 */
export async function signUpAsIndividual(
  page: Page,
  emailAddress: string,
  password: string
): Promise<void> {
  await signUpViaInvitation(page, emailAddress, password);

  await page.getByRole("radio", { name: /個人として登録/ }).check();
  await page.getByRole("button", { name: /次へ/ }).click();

  await expect(page).toHaveURL(/\/onboarding\/plan/);

  await page.getByLabel("姓").fill("テスト");
  await page.getByLabel("名").fill("太郎");
  await page.getByLabel("電話番号").fill("09012345678");
}

/**
 * `signUpAsIndividual`に加え、プラン選択画面で実際にSTARTERプランを
 * 選択して`selectPlan`サーバーアクションを実行させ（実際のauth()が返す
 * 正しいclerk_user_idでusersテーブルの行が作成される）、Stripeでの
 * 実決済は行わず本テストの前提として必要な「決済完了・オンボーディング
 * 完了済み」の状態だけをSupabase経由で作る（`checkout.spec.ts`・
 * `invoice.spec.ts`で重複していた処理を共通化）。
 */
export async function signUpAndCompleteOnboarding(
  page: Page,
  emailAddress: string,
  password: string
): Promise<void> {
  await signUpAsIndividual(page, emailAddress, password);

  await page.getByRole("radio", { name: /STARTER/ }).check();
  await page.getByRole("button", { name: /このプランで始める/ }).click();

  // selectPlanサーバーアクションの完了（usersテーブルの行作成）を待つ。
  // /onboarding/payment はStripeセッション作成後すぐ外部ドメインへ
  // サーバーリダイレクトされる中継点のため、どちらかへの遷移を待てばよい
  await expect(page).toHaveURL(/\/onboarding\/payment|checkout\.stripe\.com/);

  const { error } = await supabaseAdmin()
    .from("users")
    .update({
      onboarding_completed: true,
      subscribed_at: new Date().toISOString(),
    })
    .eq("email", emailAddress);
  if (error) {
    throw new Error(`テスト用会員行の更新に失敗しました: ${error.message}`);
  }

  await page.goto("/shop");
}

export async function cleanupTestUser(emailAddress: string) {
  // ClerkのFAPI/Backend APIがこの実行環境で断続的に失敗することがあり、
  // ここで例外が伝播すると後続のSupabase側の削除が一切実行されず
  // テスト用会員行が削除されずに残り続けてしまう。Clerk側の後片付けは
  // ベストエフォートとし、Supabase側の削除は必ず実行する
  try {
    const clerk = await clerkClient();
    const clerkUserId = await getClerkUserIdByEmail(emailAddress);
    if (clerkUserId) {
      await clerk.users.deleteUser(clerkUserId).catch(() => {});
    }
    await revokePendingInvitationsForEmail(emailAddress);
  } catch {
    // ベストエフォート。Clerk側の後片付けに失敗してもSupabase側の削除は続行する
  }

  const supabase = supabaseAdmin();
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .eq("email", emailAddress);

  // usersを直接削除しようとすると、テスト中に作成したaddresses/ordersが
  // user_idを参照しているため外部キー制約違反で失敗し、それに気づかないまま
  // usersの行が残り続けてしまう。参照している行を先に削除してから消す
  for (const user of users ?? []) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", user.id);
    for (const order of orders ?? []) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
    }
    await supabase.from("orders").delete().eq("user_id", user.id);
    await supabase.from("addresses").delete().eq("user_id", user.id);
  }

  await supabase.from("users").delete().eq("email", emailAddress);
}

/**
 * organization-signup.spec.ts等の法人E2Eテストで作成した組織を後片付けする。
 * Supabase側だけでなく、createOrganizationUseCaseが作成したClerk Organization
 * リソースも削除しないと、Clerk Dashboard上にテスト用組織が残り続ける。
 */
export async function cleanupTestOrganization(name: string) {
  const supabase = supabaseAdmin();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, clerk_org_id")
    .eq("name", name)
    .maybeSingle();
  if (!org) return;

  await supabase
    .from("organization_memberships")
    .delete()
    .eq("organization_id", org.id);
  await supabase.from("organizations").delete().eq("id", org.id);

  try {
    const clerk = await clerkClient();
    await clerk.organizations.deleteOrganization(org.clerk_org_id);
  } catch {
    // ベストエフォート。Clerk側の後片付けに失敗してもSupabase側の削除は完了している
  }
}
