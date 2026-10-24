import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * オンボーディング（個人・STARTERプラン・決済完了）を終えた状態のusers行を
 * 画面を経由せずDBに直接用意する。middlewareはusers.onboarding_completedだけを見て
 * 業務画面へのアクセスを許可するため、Clerk側のメタデータは更新不要。
 *
 * Playwrightに依存させず、統合テスト（tests/integration/e2e-helpers/）から呼べるように分けている。
 * `beforeInsert`は、探してから作るまでの間にuser.created Webhookの行が作られる状況を
 * 統合テストで再現するためのもの
 */
export async function ensureOnboardedMember(
  supabase: SupabaseClient<Database>,
  clerkUserId: string,
  email: string,
  hooks: { beforeInsert?: () => Promise<void> } = {}
): Promise<string> {
  return ensureMemberRow(
    supabase,
    clerkUserId,
    email,
    { onboardingCompleted: true },
    hooks
  );
}

/**
 * 個人・STARTERプランのusers行を、`onboardingCompleted`の状態で用意する。
 * 決済直前（未入会）の行が要るテスト（onboarding-success.spec.ts）は`false`を指定する。
 * 前回の実行の行が残っていれば、その行を指定した状態に戻して使う
 */
export async function ensureMemberRow(
  supabase: SupabaseClient<Database>,
  clerkUserId: string,
  email: string,
  { onboardingCompleted }: { onboardingCompleted: boolean },
  hooks: { beforeInsert?: () => Promise<void> } = {}
): Promise<string> {
  const profile = {
    email,
    last_name: "テスト",
    first_name: "太郎",
    phone_number: "09012345678",
    rank_code: "starter",
    member_type: "individual",
    onboarding_completed: onboardingCompleted,
    billing_anchor_day: Math.min(new Date().getDate(), 28),
  };

  // clerk_user_idの一意制約は`WHERE deleted_at IS NULL`の部分UNIQUEインデックスのため、
  // upsert(onConflict)ではなく、有効な行を更新し、無ければ作成する
  const updateActiveRow = async (): Promise<string | undefined> => {
    const { data, error } = await supabase
      .from("users")
      .update(profile)
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      throw new Error(`テスト会員行の更新に失敗しました: ${error.message}`);
    }
    return data[0]?.id;
  };

  const existingId = await updateActiveRow();
  if (existingId) return existingId;

  await hooks.beforeInsert?.();
  const { data: created, error } = await supabase
    .from("users")
    .insert({ ...profile, clerk_user_id: clerkUserId })
    .select("id")
    .single();
  if (!error) return created.id;

  // stgでは、Clerkユーザーの作成で飛んだuser.created Webhookが、更新してから作成するまでの間に
  // 有効な行を作ることがある（#494）。その行を指定した状態に更新する。
  // 作成の後に届いた場合は、Webhook側（insertIfAbsent）が既存の行を残して何もしない
  if (
    error.code === "23505" &&
    error.message.includes("users_clerk_user_id_active_idx")
  ) {
    const conflictedId = await updateActiveRow();
    if (conflictedId) return conflictedId;
  }
  throw new Error(`テスト会員行の作成に失敗しました: ${error.message}`);
}
