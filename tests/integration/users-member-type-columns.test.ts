import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// GitHub issue #200: 複数メンバー共有型の法人組織（organizations）は見送り、
// 法人会員も個人と同じ「1アカウント＝1担当者」として扱う。
// users.member_type/company_name/invoice_registration_numberが
// 期待通りのCHECK制約になっていることを検証する。

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-000000002001";
const CLERK_USER_ID = "clerk_test_member_type_columns";

async function cleanup() {
  await supabase.from("users").delete().eq("id", USER_ID);
}

beforeAll(cleanup);
afterAll(cleanup);

describe("users: member_type/company_name/invoice_registration_number", () => {
  afterAll(cleanup);

  it("member_typeを指定しない場合はindividualがデフォルトになる", async () => {
    const { error } = await supabase.from("users").insert({
      id: USER_ID,
      clerk_user_id: CLERK_USER_ID,
      email: "member-type-columns@example.com",
    });
    expect(error).toBeNull();

    const { data } = await supabase
      .from("users")
      .select("member_type")
      .eq("id", USER_ID)
      .single();
    expect(data?.member_type).toBe("individual");
  });

  it("member_typeはindividual/corporate以外を拒否する（CHECK制約）", async () => {
    const { error } = await supabase
      .from("users")
      .update({ member_type: "not-a-real-type" })
      .eq("id", USER_ID);
    expect(error).not.toBeNull();
  });

  it("member_type='corporate'の場合はcompany_nameが必須", async () => {
    const withoutCompanyName = await supabase
      .from("users")
      .update({
        member_type: "corporate",
        invoice_registration_number: "T1234567890123",
      })
      .eq("id", USER_ID);
    expect(withoutCompanyName.error).not.toBeNull();

    const withCompanyName = await supabase
      .from("users")
      .update({
        member_type: "corporate",
        company_name: "テスト株式会社",
        invoice_registration_number: "T1234567890123",
      })
      .eq("id", USER_ID);
    expect(withCompanyName.error).toBeNull();
  });

  it("member_type='corporate'の場合はinvoice_registration_numberが必須", async () => {
    const withoutInvoiceNumber = await supabase
      .from("users")
      .update({
        member_type: "corporate",
        company_name: "テスト株式会社",
        invoice_registration_number: null,
      })
      .eq("id", USER_ID);
    expect(withoutInvoiceNumber.error).not.toBeNull();
  });

  it("invoice_registration_numberは「T」+数字13桁以外を拒否する（CHECK制約）", async () => {
    const invalid = await supabase
      .from("users")
      .update({ invoice_registration_number: "invalid" })
      .eq("id", USER_ID);
    expect(invalid.error).not.toBeNull();

    const valid = await supabase
      .from("users")
      .update({ invoice_registration_number: "T1234567890123" })
      .eq("id", USER_ID);
    expect(valid.error).toBeNull();
  });

  it("member_type='individual'に戻すとcompany_name/invoice_registration_numberはNULLでもよい", async () => {
    const { error } = await supabase
      .from("users")
      .update({
        member_type: "individual",
        company_name: null,
        invoice_registration_number: null,
      })
      .eq("id", USER_ID);
    expect(error).toBeNull();
  });
});
