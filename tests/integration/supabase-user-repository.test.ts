import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { MemberType } from "@/domain/value-objects/member-type";
import { User } from "@/domain/entities/user";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000010";
const TEST_CLERK_ID = "clerk_test_infra_001";

// 退会済み行と有効な行の併存（部分UNIQUEが許す）・save時の衝突・insertIfAbsent用
const COEXIST_CLERK_ID = "clerk_test_infra_coexist";
const COEXIST_DELETED_ID = "00000000-0000-0000-0000-000000000011";
const COEXIST_ACTIVE_ID = "00000000-0000-0000-0000-000000000012";
const CONFLICT_CLERK_ID = "clerk_test_infra_conflict";
const INSERT_CLERK_ID = "clerk_test_infra_insert_if_absent";

// 不正なキーのクライアント。PostgRESTが認証エラーを返すため、DBエラー時の挙動を確認できる
const brokenClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  "invalid-key",
  { auth: { persistSession: false } }
);

function newUser(
  clerkUserId: string,
  overrides?: Partial<Parameters<typeof User.of>[0]>
) {
  return User.of({
    id: crypto.randomUUID(),
    clerkUserId,
    email: `${clerkUserId}@example.com`,
    firstName: "",
    lastName: "",
    phoneNumber: "",
    profileCompletedAt: null,
    rank: MemberRank.of("starter"),
    billingAnchorDay: null,
    onboardingCompleted: false,
    deletedAt: null,
    stripeCustomerId: null,
    ...overrides,
  });
}

async function cleanupExtra() {
  await supabase
    .from("users")
    .delete()
    .in("clerk_user_id", [
      COEXIST_CLERK_ID,
      CONFLICT_CLERK_ID,
      INSERT_CLERK_ID,
    ]);
}

beforeAll(async () => {
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  await cleanupExtra();
  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "infra-test@example.com",
    first_name: "インフラ",
    last_name: "テスト",
    rank_code: "basic",
    onboarding_completed: true,
    billing_anchor_day: 10,
  });
});

afterAll(async () => {
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  await cleanupExtra();
});

describe("SupabaseUserRepository", () => {
  const repo = new SupabaseUserRepository(supabase);

  describe("findByClerkUserId()", () => {
    it("存在するユーザーを返す", async () => {
      const user = await repo.findByClerkUserId(TEST_CLERK_ID);
      expect(user).not.toBeNull();
      expect(user!.id).toBe(TEST_USER_ID);
      expect(user!.email).toBe("infra-test@example.com");
      expect(user!.rank.value).toBe("basic");
    });

    it("存在しないユーザーは null を返す", async () => {
      const user = await repo.findByClerkUserId("clerk_nonexistent");
      expect(user).toBeNull();
    });

    it("退会済み行と有効な行が併存するとき、有効な行を返す", async () => {
      await supabase.from("users").insert([
        {
          id: COEXIST_DELETED_ID,
          clerk_user_id: COEXIST_CLERK_ID,
          email: "coexist-deleted@example.com",
          first_name: "退会",
          last_name: "済み",
          deleted_at: new Date().toISOString(),
        },
        {
          id: COEXIST_ACTIVE_ID,
          clerk_user_id: COEXIST_CLERK_ID,
          email: "coexist-active@example.com",
          first_name: "有効",
          last_name: "会員",
        },
      ]);

      const user = await repo.findByClerkUserId(COEXIST_CLERK_ID);
      expect(user?.id).toBe(COEXIST_ACTIVE_ID);
    });

    it("退会済み行しか無いときは null を返す", async () => {
      await supabase.from("users").delete().eq("id", COEXIST_ACTIVE_ID);

      const user = await repo.findByClerkUserId(COEXIST_CLERK_ID);
      expect(user).toBeNull();
    });

    it("DBエラーは例外になる", async () => {
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(broken.findByClerkUserId(TEST_CLERK_ID)).rejects.toThrow();
    });
  });

  describe("findById()", () => {
    it("存在するユーザーを返す", async () => {
      const user = await repo.findById(TEST_USER_ID);
      expect(user).not.toBeNull();
      expect(user!.clerkUserId).toBe(TEST_CLERK_ID);
    });

    it("存在しないユーザーは null を返す", async () => {
      const user = await repo.findById("00000000-0000-0000-0000-000000000000");
      expect(user).toBeNull();
    });

    it("DBエラーは例外になる", async () => {
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(broken.findById(TEST_USER_ID)).rejects.toThrow();
    });
  });

  describe("save()", () => {
    it("ランクを更新できる", async () => {
      const user = await repo.findById(TEST_USER_ID);
      await repo.save(user!.with({ rank: MemberRank.of("standard") }));

      const reloaded = await repo.findById(TEST_USER_ID);
      expect(reloaded!.rank.value).toBe("standard");
    });

    it("同じclerk_user_idの有効な行が先にあれば、その行を入力内容で更新する", async () => {
      // user.created Webhookが先に行を作っていたケース
      await repo.insertIfAbsent(newUser(CONFLICT_CLERK_ID));
      const existing = await repo.findByClerkUserId(CONFLICT_CLERK_ID);

      // selectPlanが既存行を見つけられず、新しいidで行を作ろうとしたケース
      await repo.save(
        newUser(CONFLICT_CLERK_ID, {
          firstName: "花子",
          lastName: "法人",
          phoneNumber: "09012345678",
          rank: MemberRank.of("premium"),
          memberType: MemberType.of("corporate"),
          companyName: "株式会社テスト",
          invoiceRegistrationNumber: "T1234567890123",
        })
      );

      const { data: rows } = await supabase
        .from("users")
        .select(
          "id, first_name, last_name, phone_number, rank_code, member_type, company_name, invoice_registration_number"
        )
        .eq("clerk_user_id", CONFLICT_CLERK_ID);
      expect(rows).toHaveLength(1);
      expect(rows![0]).toEqual({
        id: existing!.id,
        first_name: "花子",
        last_name: "法人",
        phone_number: "09012345678",
        rank_code: "premium",
        member_type: "corporate",
        company_name: "株式会社テスト",
        invoice_registration_number: "T1234567890123",
      });
    });

    it("DBエラーは例外になる", async () => {
      const user = await repo.findById(TEST_USER_ID);
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(broken.save(user!)).rejects.toThrow();
    });
  });

  describe("insertIfAbsent()", () => {
    it("行が無ければ作成する", async () => {
      await repo.insertIfAbsent(newUser(INSERT_CLERK_ID));

      const user = await repo.findByClerkUserId(INSERT_CLERK_ID);
      expect(user).not.toBeNull();
    });

    it("同じclerk_user_idの有効な行があれば何もせず成功する（既存行を上書きしない）", async () => {
      const before = await repo.findByClerkUserId(INSERT_CLERK_ID);
      await repo.save(before!.with({ firstName: "入力済み" }));

      await expect(
        repo.insertIfAbsent(newUser(INSERT_CLERK_ID))
      ).resolves.toBeUndefined();

      const { data: rows } = await supabase
        .from("users")
        .select("id, first_name")
        .eq("clerk_user_id", INSERT_CLERK_ID);
      expect(rows).toEqual([{ id: before!.id, first_name: "入力済み" }]);
    });

    it("DBエラーは例外になる", async () => {
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(
        broken.insertIfAbsent(newUser("clerk_test_infra_broken"))
      ).rejects.toThrow();
    });
  });
});
