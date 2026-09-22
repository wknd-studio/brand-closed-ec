import { describe, it, expect, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」6番（GitHub issue #170、親issue #165）。
// users.clerk_user_id/stripe_customer_idが、`WHERE deleted_at IS NULL`の
// 部分UNIQUEインデックスへ変更されたことを検証する。
// 論理削除後は同じ値で再登録でき、かつ削除されていない行同士では引き続き重複を拒否する。

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID_1 = "00000000-0000-0000-0000-0000000012a1";
const USER_ID_2 = "00000000-0000-0000-0000-0000000012a2";
const CLERK_USER_ID = "clerk_test_partial_unique";
const STRIPE_CUSTOMER_ID_USER = "cus_test_partial_unique_user";

async function cleanup() {
  await supabase.from("users").delete().in("id", [USER_ID_1, USER_ID_2]);
}

describe("users: clerk_user_id/stripe_customer_idの部分UNIQUEインデックス", () => {
  afterEach(cleanup);

  it("退会（論理削除）済みユーザーと同じclerk_user_idで新規登録できる", async () => {
    await cleanup();
    const deleted = await supabase.from("users").insert({
      id: USER_ID_1,
      clerk_user_id: CLERK_USER_ID,
      email: "partial-unique-1@example.com",
      deleted_at: new Date().toISOString(),
    });
    expect(deleted.error).toBeNull();

    const reregistered = await supabase.from("users").insert({
      id: USER_ID_2,
      clerk_user_id: CLERK_USER_ID,
      email: "partial-unique-2@example.com",
    });
    expect(reregistered.error).toBeNull();
  });

  it("削除されていない2行が同じclerk_user_idを持つことはできない", async () => {
    await cleanup();
    const first = await supabase.from("users").insert({
      id: USER_ID_1,
      clerk_user_id: CLERK_USER_ID,
      email: "partial-unique-1@example.com",
    });
    expect(first.error).toBeNull();

    const second = await supabase.from("users").insert({
      id: USER_ID_2,
      clerk_user_id: CLERK_USER_ID,
      email: "partial-unique-2@example.com",
    });
    expect(second.error).not.toBeNull();
  });

  it("退会済みユーザーと同じstripe_customer_idで新規登録できる", async () => {
    await cleanup();
    const deleted = await supabase.from("users").insert({
      id: USER_ID_1,
      clerk_user_id: "clerk_test_partial_unique_1",
      email: "partial-unique-1@example.com",
      stripe_customer_id: STRIPE_CUSTOMER_ID_USER,
      deleted_at: new Date().toISOString(),
    });
    expect(deleted.error).toBeNull();

    const reregistered = await supabase.from("users").insert({
      id: USER_ID_2,
      clerk_user_id: "clerk_test_partial_unique_2",
      email: "partial-unique-2@example.com",
      stripe_customer_id: STRIPE_CUSTOMER_ID_USER,
    });
    expect(reregistered.error).toBeNull();
  });
});
