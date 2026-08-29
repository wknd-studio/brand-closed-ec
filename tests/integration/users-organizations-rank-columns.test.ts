import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」3番（GitHub issue #167、親issue #165）。
// users/organizationsのrank/pending_rank/initial_fee_paid_rank等をStripe専用
// テーブル(subscriptions/rank_changes)向けの列構成へ変更したことを検証する。

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-0000000011a1";
const ORG_ID = "00000000-0000-0000-0000-0000000011a2";
const CLERK_USER_ID = "clerk_test_rank_columns";
const CLERK_ORG_ID = "org_test_rank_columns";

async function cleanup() {
  await supabase.from("users").delete().in("id", [USER_ID]);
  await supabase.from("organizations").delete().in("id", [ORG_ID]);
}

beforeAll(cleanup);
afterAll(cleanup);

describe("users: rank_code/billing_anchor_day/initial_fee_paid_rank_code", () => {
  afterAll(async () => {
    await supabase.from("users").delete().eq("id", USER_ID);
  });

  it("rank_codeを指定しない場合はstarterがデフォルトになる", async () => {
    const { error } = await supabase.from("users").insert({
      id: USER_ID,
      clerk_user_id: CLERK_USER_ID,
      email: "rank-columns@example.com",
    });
    expect(error).toBeNull();

    const { data } = await supabase
      .from("users")
      .select("rank_code")
      .eq("id", USER_ID)
      .single();
    expect(data?.rank_code).toBe("starter");
  });

  it("member_ranksに存在しないrank_codeは拒否される（FK制約）", async () => {
    const { error } = await supabase
      .from("users")
      .update({ rank_code: "not-a-real-rank" })
      .eq("id", USER_ID);
    expect(error).not.toBeNull();
  });

  it("billing_anchor_dayは1〜28の範囲外を拒否する", async () => {
    const tooLow = await supabase
      .from("users")
      .update({ billing_anchor_day: 0 })
      .eq("id", USER_ID);
    expect(tooLow.error).not.toBeNull();

    const tooHigh = await supabase
      .from("users")
      .update({ billing_anchor_day: 29 })
      .eq("id", USER_ID);
    expect(tooHigh.error).not.toBeNull();

    const ok = await supabase
      .from("users")
      .update({ billing_anchor_day: 15 })
      .eq("id", USER_ID);
    expect(ok.error).toBeNull();
  });

  it("initial_fee_paid_rank_codeはmember_ranks.codeへのFKで、有効なコードのみ設定できる", async () => {
    const invalid = await supabase
      .from("users")
      .update({ initial_fee_paid_rank_code: "not-a-real-rank" })
      .eq("id", USER_ID);
    expect(invalid.error).not.toBeNull();

    const valid = await supabase
      .from("users")
      .update({ initial_fee_paid_rank_code: "basic" })
      .eq("id", USER_ID);
    expect(valid.error).toBeNull();
  });

  it("旧stripe_subscription_id/subscribed_at列は削除されている", async () => {
    // 削除済みカラムをあえて指定し、PostgRESTのカラム未検出エラーを確認する
    // （型定義からも削除済みのためselect文字列はDatabase型では検証されない）
    const { error } = await supabase
      .from("users")
      .select("stripe_subscription_id, subscribed_at")
      .eq("id", USER_ID);
    expect(error).not.toBeNull();
  });
});

describe("organizations: rank_code/initial_fee_paid_rank_code", () => {
  beforeAll(async () => {
    const { error } = await supabase.from("organizations").insert({
      id: ORG_ID,
      clerk_org_id: CLERK_ORG_ID,
      name: "ランクカラムテスト株式会社",
      representative_name: "代表 太郎",
      phone_number: "0300000002",
      invoice_registration_number: "T1000000000011",
    });
    expect(error).toBeNull();
  });

  it("rank_codeを指定しない場合はstarterがデフォルトになる", async () => {
    const { data } = await supabase
      .from("organizations")
      .select("rank_code")
      .eq("id", ORG_ID)
      .single();
    expect(data?.rank_code).toBe("starter");
  });

  it("member_ranksに存在しないrank_codeは拒否される（FK制約）", async () => {
    const { error } = await supabase
      .from("organizations")
      .update({ rank_code: "not-a-real-rank" })
      .eq("id", ORG_ID);
    expect(error).not.toBeNull();
  });

  it("initial_fee_paid_rank_codeはmember_ranks.codeへのFKで、有効なコードのみ設定できる", async () => {
    const invalid = await supabase
      .from("organizations")
      .update({ initial_fee_paid_rank_code: "not-a-real-rank" })
      .eq("id", ORG_ID);
    expect(invalid.error).not.toBeNull();

    const valid = await supabase
      .from("organizations")
      .update({ initial_fee_paid_rank_code: "standard" })
      .eq("id", ORG_ID);
    expect(valid.error).toBeNull();
  });

  it("旧pending_rank/stripe_subscription_id/stripe_subscription_schedule_id列は削除されている", async () => {
    // 削除済みカラムをあえて指定し、PostgRESTのカラム未検出エラーを確認する
    // （型定義からも削除済みのためselect文字列はDatabase型では検証されない）
    const { error } = await supabase
      .from("organizations")
      .select(
        "pending_rank, stripe_subscription_id, stripe_subscription_schedule_id"
      )
      .eq("id", ORG_ID);
    expect(error).not.toBeNull();
  });
});
