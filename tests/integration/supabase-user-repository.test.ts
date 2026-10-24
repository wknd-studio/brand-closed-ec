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
const BEFORE_ONBOARDING_CLERK_ID = "clerk_test_infra_save_before_onboarding";
const KEEP_OTHER_COLUMNS_CLERK_ID = "clerk_test_infra_select_plan_keep_columns";

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
      BEFORE_ONBOARDING_CLERK_ID,
      KEEP_OTHER_COLUMNS_CLERK_ID,
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
    initial_fee_paid_rank_code: "standard",
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
      expect(user!.initialFeePaidRank?.value).toBe("standard");
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

  describe("hasWithdrawnByClerkUserId()", () => {
    const WITHDRAWN_ONLY_CLERK_ID = "clerk_test_infra_withdrawn_only";
    const WITHDRAWN_ONLY_ID = "00000000-0000-0000-0000-000000000013";

    beforeAll(async () => {
      await supabase.from("users").delete().eq("id", WITHDRAWN_ONLY_ID);
      const { error } = await supabase.from("users").insert({
        id: WITHDRAWN_ONLY_ID,
        clerk_user_id: WITHDRAWN_ONLY_CLERK_ID,
        email: "withdrawn-only@example.com",
        first_name: "退会",
        last_name: "済み",
        deleted_at: new Date().toISOString(),
      });
      if (error) throw error;
    });

    afterAll(async () => {
      await supabase.from("users").delete().eq("id", WITHDRAWN_ONLY_ID);
    });

    it("退会済み行があれば true を返す", async () => {
      await expect(
        repo.hasWithdrawnByClerkUserId(WITHDRAWN_ONLY_CLERK_ID)
      ).resolves.toBe(true);
    });

    it("有効な行しか無ければ false を返す", async () => {
      await expect(repo.hasWithdrawnByClerkUserId(TEST_CLERK_ID)).resolves.toBe(
        false
      );
    });

    it("行が無ければ false を返す", async () => {
      await expect(
        repo.hasWithdrawnByClerkUserId("clerk_nonexistent")
      ).resolves.toBe(false);
    });

    it("DBエラーは例外になる", async () => {
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(
        broken.hasWithdrawnByClerkUserId(TEST_CLERK_ID)
      ).rejects.toThrow();
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
    it("initial_fee_paid_rank_codeは書き換えない（入会確定等のRPCだけが更新する）", async () => {
      const user = await repo.findById(TEST_USER_ID);
      await repo.save(user!.with({ initialFeePaidRank: null }));

      const { data } = await supabase
        .from("users")
        .select("initial_fee_paid_rank_code")
        .eq("id", TEST_USER_ID)
        .single();
      expect(data?.initial_fee_paid_rank_code).toBe("standard");
    });

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

  describe("saveIfNotOnboarded()", () => {
    it("有効な行が無ければ作成して true を返す", async () => {
      const user = newUser(BEFORE_ONBOARDING_CLERK_ID, {
        rank: MemberRank.of("basic"),
      });

      await expect(repo.saveIfNotOnboarded(user)).resolves.toBe(true);

      const saved = await repo.findByClerkUserId(BEFORE_ONBOARDING_CLERK_ID);
      expect(saved!.id).toBe(user.id);
      expect(saved!.rank.value).toBe("basic");
    });

    it("未入会の有効な行があれば、別のidで渡されてもその行を入力内容で更新して true を返す", async () => {
      // user.created Webhookが先に行を作り、selectPlanがそれを見つけられなかったケース
      const existing = await repo.findByClerkUserId(BEFORE_ONBOARDING_CLERK_ID);

      await expect(
        repo.saveIfNotOnboarded(
          newUser(BEFORE_ONBOARDING_CLERK_ID, {
            firstName: "花子",
            rank: MemberRank.of("premium"),
          })
        )
      ).resolves.toBe(true);

      const { data: rows } = await supabase
        .from("users")
        .select("id, first_name, rank_code")
        .eq("clerk_user_id", BEFORE_ONBOARDING_CLERK_ID);
      expect(rows).toEqual([
        { id: existing!.id, first_name: "花子", rank_code: "premium" },
      ]);
    });

    it("入会済みの有効な行には保存せず false を返す（入会確定を未入会に戻さない）", async () => {
      const existing = await repo.findByClerkUserId(BEFORE_ONBOARDING_CLERK_ID);
      // 読み取った後に入会確定のWebhookが入会済みにしたケース
      await supabase
        .from("users")
        .update({ onboarding_completed: true })
        .eq("id", existing!.id);

      await expect(
        repo.saveIfNotOnboarded(
          existing!.with({
            firstName: "上書き",
            rank: MemberRank.of("starter"),
            onboardingCompleted: false,
          })
        )
      ).resolves.toBe(false);

      const { data: rows } = await supabase
        .from("users")
        .select("id, first_name, rank_code, onboarding_completed")
        .eq("clerk_user_id", BEFORE_ONBOARDING_CLERK_ID);
      expect(rows).toEqual([
        {
          id: existing!.id,
          first_name: "花子",
          rank_code: "premium",
          onboarding_completed: true,
        },
      ]);
    });

    it("入会済みの有効な行があるとき、別のidで渡されても行を作らず false を返す", async () => {
      await expect(
        repo.saveIfNotOnboarded(newUser(BEFORE_ONBOARDING_CLERK_ID))
      ).resolves.toBe(false);

      const { data: rows } = await supabase
        .from("users")
        .select("onboarding_completed")
        .eq("clerk_user_id", BEFORE_ONBOARDING_CLERK_ID);
      expect(rows).toEqual([{ onboarding_completed: true }]);
    });

    it("読み取りの後に他の処理が書いた stripe_customer_id・billing_anchor_day を上書きせず、プラン選択の列だけを更新する", async () => {
      await repo.saveIfNotOnboarded(newUser(KEEP_OTHER_COLUMNS_CLERK_ID));
      const existing = await repo.findByClerkUserId(
        KEEP_OTHER_COLUMNS_CLERK_ID
      );
      // 読み取った後に、別のタブの決済画面がStripe Customerを作って保存したケース
      await supabase
        .from("users")
        .update({ stripe_customer_id: "cus_test_keep", billing_anchor_day: 15 })
        .eq("id", existing!.id);

      await expect(
        repo.saveIfNotOnboarded(
          existing!.with({
            email: "keep-columns@example.com",
            firstName: "太郎",
            lastName: "法人",
            phoneNumber: "09012345678",
            rank: MemberRank.of("premium"),
            onboardingCompleted: false,
            memberType: MemberType.of("corporate"),
            companyName: "テスト株式会社",
            invoiceRegistrationNumber: "T1234567890123",
          })
        )
      ).resolves.toBe(true);

      const { data: row } = await supabase
        .from("users")
        .select(
          "email, first_name, last_name, phone_number, rank_code, member_type, company_name, invoice_registration_number, stripe_customer_id, billing_anchor_day, onboarding_completed"
        )
        .eq("id", existing!.id)
        .single();
      expect(row).toEqual({
        email: "keep-columns@example.com",
        first_name: "太郎",
        last_name: "法人",
        phone_number: "09012345678",
        rank_code: "premium",
        member_type: "corporate",
        company_name: "テスト株式会社",
        invoice_registration_number: "T1234567890123",
        stripe_customer_id: "cus_test_keep",
        billing_anchor_day: 15,
        onboarding_completed: false,
      });
    });

    it("DBエラーは例外になる", async () => {
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(
        broken.saveIfNotOnboarded(newUser("clerk_test_infra_broken"))
      ).rejects.toThrow();
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

  describe("saveStripeCustomerId()", () => {
    const STRIPE_CLERK_ID = "clerk_test_infra_stripe_customer";
    const STRIPE_ACTIVE_ID = "00000000-0000-0000-0000-000000000014";
    const STRIPE_DELETED_ID = "00000000-0000-0000-0000-000000000015";

    beforeAll(async () => {
      await supabase
        .from("users")
        .delete()
        .in("id", [STRIPE_ACTIVE_ID, STRIPE_DELETED_ID]);
      const { error } = await supabase.from("users").insert([
        {
          id: STRIPE_ACTIVE_ID,
          clerk_user_id: STRIPE_CLERK_ID,
          email: "stripe-active@example.com",
          first_name: "決済",
          last_name: "前",
          rank_code: "premium",
          onboarding_completed: false,
          deleted_at: null,
        },
        {
          id: STRIPE_DELETED_ID,
          clerk_user_id: STRIPE_CLERK_ID,
          email: "stripe-deleted@example.com",
          first_name: "退会",
          last_name: "済み",
          // 複数行のinsertは列をそろえないと、省いた列がDEFAULTではなくNULLになる
          rank_code: "premium",
          onboarding_completed: false,
          deleted_at: new Date().toISOString(),
        },
      ]);
      if (error) throw error;
    });

    afterAll(async () => {
      await supabase
        .from("users")
        .delete()
        .in("id", [STRIPE_ACTIVE_ID, STRIPE_DELETED_ID]);
    });

    it("有効な行のstripe_customer_idだけを更新する", async () => {
      await repo.saveStripeCustomerId(STRIPE_ACTIVE_ID, "cus_infra_saved");

      const { data } = await supabase
        .from("users")
        .select("stripe_customer_id, rank_code, onboarding_completed, email")
        .eq("id", STRIPE_ACTIVE_ID)
        .single();
      expect(data).toEqual({
        stripe_customer_id: "cus_infra_saved",
        rank_code: "premium",
        onboarding_completed: false,
        email: "stripe-active@example.com",
      });
    });

    it("退会済みの行には保存せず例外にする", async () => {
      await expect(
        repo.saveStripeCustomerId(STRIPE_DELETED_ID, "cus_infra_deleted")
      ).rejects.toThrow();

      const { data } = await supabase
        .from("users")
        .select("stripe_customer_id")
        .eq("id", STRIPE_DELETED_ID)
        .single();
      expect(data?.stripe_customer_id).toBeNull();
    });

    it("行が無ければ例外にする", async () => {
      await expect(
        repo.saveStripeCustomerId(
          "00000000-0000-0000-0000-000000000000",
          "cus_infra_none"
        )
      ).rejects.toThrow();
    });

    it("DBエラーは例外になる", async () => {
      const broken = new SupabaseUserRepository(brokenClient);
      await expect(
        broken.saveStripeCustomerId(STRIPE_ACTIVE_ID, "cus_infra_broken")
      ).rejects.toThrow();
    });
  });
});
