import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  SEED_USERS,
  seedUsers,
  type SeedClerk,
} from "../../scripts/seed-users";

// GitHub issue #652: scripts/seed-users.ts が今の users テーブルに合わず（rank 列・
// clerk_user_id の部分UNIQUEインデックスへの upsert）、会員の行を1件も入れられなかった。
// Clerk だけをモックし、実DBに会員7人の行が入ること・何度実行しても同じ状態になること・
// 運営者の行を作らないことを確認する
const CLERK_ID_PREFIX = "clerk_test_seed_users_";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const clerkUserId = (email: string) => `${CLERK_ID_PREFIX}${email}`;

// 全アカウントが Clerk に既にある状態（パスワードの更新だけが走る）
const clerk: SeedClerk = {
  users: {
    getUserList: async ({ emailAddress }) => ({
      data: [{ id: clerkUserId(emailAddress[0]) }],
    }),
    createUser: async ({ emailAddress }) => ({
      id: clerkUserId(emailAddress[0]),
    }),
    updateUser: async (id) => ({ id }),
  },
};

const logger = { log: () => {}, error: () => {} };

async function seededRows() {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, clerk_user_id, email, rank_code, member_type, company_name, invoice_registration_number, onboarding_completed, phone_number, billing_anchor_day, deleted_at"
    )
    .like("clerk_user_id", `${CLERK_ID_PREFIX}%`)
    .order("email");
  if (error) throw error;
  return data;
}

async function seededSubscriptions() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, rank_code, users!inner(email, clerk_user_id)")
    .like("users.clerk_user_id", `${CLERK_ID_PREFIX}%`);
  if (error) throw error;
  return data
    .map((row) => [row.users.email, row.status, row.rank_code])
    .sort(([a], [b]) => a.localeCompare(b));
}

async function cleanup() {
  const { data } = await supabase
    .from("users")
    .select("id")
    .like("clerk_user_id", `${CLERK_ID_PREFIX}%`);
  await supabase
    .from("subscriptions")
    .delete()
    .in(
      "user_id",
      (data ?? []).map((row) => row.id)
    );
  await supabase
    .from("users")
    .delete()
    .like("clerk_user_id", `${CLERK_ID_PREFIX}%`);
}

beforeEach(cleanup);
afterAll(cleanup);

const members = SEED_USERS.filter((u) => u.role === "member");
const admins = SEED_USERS.filter((u) => u.role === "admin");

describe("seedUsers（実DB）", () => {
  it("個人会員7人・法人会員1人の行を、オンボーディングを終えた状態で入れる。運営者の行は作らない", async () => {
    await seedUsers({ clerk, supabase, password: "unused", logger });

    const rows = await seededRows();
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => [r.email, r.rank_code])).toEqual(
      members
        .map((u) => [u.email, u.rank])
        .sort(([a], [b]) => a.localeCompare(b))
    );
    for (const row of rows) {
      expect(row).toEqual(
        expect.objectContaining({
          clerk_user_id: clerkUserId(row.email),
          onboarding_completed: true,
          deleted_at: null,
        })
      );
      expect(row.phone_number).not.toBe("");
      expect(row.billing_anchor_day).not.toBeNull();
    }
    expect(
      rows.map((r) => [
        r.member_type,
        r.company_name !== null,
        r.invoice_registration_number !== null,
      ])
    ).toEqual(
      rows.map((r) =>
        r.email === "info+test_corporate@wknd-studio.com"
          ? ["corporate", true, true]
          : ["individual", false, false]
      )
    );
    const adminIds = admins.map((u) => clerkUserId(u.email));
    expect(rows.filter((r) => adminIds.includes(r.clerk_user_id))).toEqual([]);
  });

  it("何度実行しても同じ状態になる（既存の有効な行を更新し、増やさない）", async () => {
    await seedUsers({ clerk, supabase, password: "unused", logger });
    const first = await seededRows();
    expect(first).toHaveLength(8);

    // 別の状態に崩してから再実行する（user.created Webhook が作った未入会の行など）
    await supabase
      .from("users")
      .update({ onboarding_completed: false, rank_code: "starter" })
      .like("clerk_user_id", `${CLERK_ID_PREFIX}%`);
    await seedUsers({ clerk, supabase, password: "unused", logger });

    expect(await seededRows()).toEqual(first);
  });

  // GitHub issue #380: 解約済みでない subscriptions 行が無い入会済みの会員は利用停止になるため、
  // 会員ごとに有効なサブスクリプションの行も入れる。何度実行しても1つのまま
  it("会員ごとに、ランクと同じ有効なサブスクリプションの行を1つだけ入れる", async () => {
    await seedUsers({ clerk, supabase, password: "unused", logger });
    await seedUsers({ clerk, supabase, password: "unused", logger });

    expect(await seededSubscriptions()).toEqual(
      members
        .map((u) => [u.email, "active", u.rank])
        .sort(([a], [b]) => a.localeCompare(b))
    );
  });

  it("退会済みの行が残っていても失敗せず、有効な行を別に作る", async () => {
    const [member] = members;
    const { error } = await supabase.from("users").insert({
      clerk_user_id: clerkUserId(member.email),
      email: member.email,
      deleted_at: new Date().toISOString(),
    });
    if (error) throw error;

    await seedUsers({ clerk, supabase, password: "unused", logger });

    const rows = (await seededRows()).filter((r) => r.email === member.email);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.deleted_at === null)).toEqual([
      expect.objectContaining({ onboarding_completed: true }),
    ]);
  });
});
