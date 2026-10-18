import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import { test as base, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  cleanupTestUser,
  slotEmail,
  withSlotSuffix,
} from "./clerk-test-invitation";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export type TestMember = {
  email: string;
  /** Supabaseのusers.id */
  userId: string;
};

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Sanityのテスト用ドキュメントID・ブランド名等を、スロット（並列worktree/CI実行）に加えて
 * Playwrightのワーカーごとにも一意化する。`--repeat-each`等で同じspecが複数ワーカーで
 * 同時に走ると、あるワーカーのafterAllが別ワーカーの使用中のドキュメントを削除してしまうため
 */
export function withWorkerSuffix(base: string): string {
  return withSlotSuffix(`${base}_w${process.env.TEST_PARALLEL_INDEX ?? "0"}`);
}

/**
 * Clerk上のテスト会員を用意する。前回の実行が中断され削除されずに残っていれば再利用する
 */
async function ensureClerkUser(email: string): Promise<string> {
  const clerkApi = await clerkClient();
  const { data } = await clerkApi.users.getUserList({ emailAddress: [email] });
  if (data[0]) return data[0].id;

  const created = await clerkApi.users.createUser({
    emailAddress: [email],
    // このインスタンスはパスワードが唯一の認証要素のため省略できない（422になる）。
    // ログインはclerk.signInのサインイントークンで行い、パスワードは使わないので乱数でよい
    password: `E2e-${crypto.randomUUID()}`,
    // 画面登録時にはLegal Consentのチェックボックスで同意するが、
    // Backend APIからの作成ではその同意手続きを省略する
    skipLegalChecks: true,
  });
  return created.id;
}

/**
 * オンボーディング（個人・STARTERプラン・決済完了）を終えた状態のusers行を
 * 画面を経由せずDBに直接用意する。middlewareはusers.onboarding_completedだけを見て
 * 業務画面へのアクセスを許可するため、Clerk側のメタデータは更新不要
 */
async function ensureOnboardedMember(
  clerkUserId: string,
  email: string
): Promise<string> {
  const supabase = supabaseAdmin();
  const profile = {
    email,
    last_name: "テスト",
    first_name: "太郎",
    phone_number: "09012345678",
    rank_code: "starter",
    member_type: "individual",
    onboarding_completed: true,
    billing_anchor_day: Math.min(new Date().getDate(), 28),
  };

  // clerk_user_idの一意制約は`WHERE deleted_at IS NULL`の部分UNIQUEインデックスのため、
  // upsert(onConflict)ではなく検索してから更新・作成する
  const { data: existing, error: selectError } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (selectError) {
    throw new Error(`テスト会員行の取得に失敗しました: ${selectError.message}`);
  }

  if (existing) {
    const { error } = await supabase
      .from("users")
      .update(profile)
      .eq("id", existing.id);
    if (error) {
      throw new Error(`テスト会員行の更新に失敗しました: ${error.message}`);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({ ...profile, clerk_user_id: clerkUserId })
    .select("id")
    .single();
  if (error) {
    throw new Error(`テスト会員行の作成に失敗しました: ${error.message}`);
  }
  return created.id;
}

/**
 * テスト中に作成された注文・住所・カート等を削除する。会員（Clerkユーザー・users行）
 * 自体は同じワーカーの次のテストで使い回すため削除しない
 */
async function cleanupMemberData(userId: string): Promise<void> {
  const supabase = supabaseAdmin();
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId);
  const orderIds = (orders ?? []).map((order) => order.id);
  if (orderIds.length > 0) {
    // order_items.settlement_idがorder_settlementsを参照するため、明細を先に削除する
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("order_settlements").delete().in("order_id", orderIds);
  }
  await supabase.from("orders").delete().eq("user_id", userId);
  await supabase.from("addresses").delete().eq("user_id", userId);
  await supabase.from("cart_items").delete().eq("user_id", userId);
  await supabase.from("favorites").delete().eq("user_id", userId);

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || count !== 0) {
    throw new Error(
      `テスト会員の注文データの削除に失敗しました: ${error?.message ?? `${count}件残存`}`
    );
  }
}

/**
 * 業務フローのE2E用fixture。画面での会員登録・ログインを経由せず、
 * Playwrightのワーカーごとに1人のオンボーディング済みテスト会員を用意し、
 * `clerk.signIn`（Backendで発行したサインイントークンでログインするため、
 * パスワード入力やMFAを経由しない）で得たログイン状態を`storageState`として
 * そのワーカーの全テストで使い回す。
 *
 * 会員をワーカーごとに分けるのは、テストがカート・注文などサーバー側の状態を
 * 書き換えるため（Playwright公式の「one account per parallel worker」パターン）。
 * Clerk Backend APIの呼び出しはワーカー数に比例し、テスト数には比例しない。
 *
 * ワーカー終了時に会員をClerk・DBから削除する。CIではメールアドレスにGITHUB_RUN_IDが
 * 付き実行ごとに別の会員になるため、削除しないとClerk上にテスト会員が溜まり続ける
 */
// fixtureの第2引数は慣例では`use`だが、React Hooksのlintルールがフックと誤認するため別名にする
export const test = base.extend<
  { member: TestMember },
  { workerMember: TestMember & { storageState: StorageState } }
>({
  workerMember: [
    async ({ browser }, provide, workerInfo) => {
      const email = slotEmail(
        `info+clerk_test_order_w${workerInfo.parallelIndex}@wknd-studio.com`
      );
      const clerkUserId = await ensureClerkUser(email);
      const userId = await ensureOnboardedMember(clerkUserId, email);

      const context = await browser.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      const page = await context.newPage();
      // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: email });
      const storageState = await context.storageState();
      await context.close();

      await provide({ email, userId, storageState });
      await cleanupTestUser(email);
    },
    { scope: "worker" },
  ],

  storageState: async ({ workerMember }, provide) => {
    await provide(workerMember.storageState);
  },

  // テスト本体が会員情報を参照しない場合も片付けを必ず行うため、autoにする
  member: [
    async ({ workerMember }, provide) => {
      const { email, userId } = workerMember;
      // 前回の実行が中断されデータが残っている場合に備え、開始前にも片付ける
      await cleanupMemberData(userId);
      await provide({ email, userId });
      await cleanupMemberData(userId);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
