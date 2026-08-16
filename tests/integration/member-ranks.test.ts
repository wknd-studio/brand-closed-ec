import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { RANK_ORDER } from "@/domain/value-objects/member-rank";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

describe("member_ranks（参照テーブル）", () => {
  it("RANK_ORDERと同じ7件が、その順序でsort_orderに反映されている", async () => {
    const { data, error } = await supabase
      .from("member_ranks")
      .select(
        "code, sort_order, display_name_ja, monthly_limit_amount, is_active"
      )
      .order("sort_order", { ascending: true });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.map((row) => row.code)).toEqual([...RANK_ORDER]);
  });

  it("sort_orderは0始まりの連番で、codeの重複が無い", async () => {
    const { data } = await supabase
      .from("member_ranks")
      .select("code, sort_order")
      .order("sort_order", { ascending: true });

    expect(data!.map((row) => row.sort_order)).toEqual(data!.map((_, i) => i));
    expect(new Set(data!.map((row) => row.code)).size).toBe(data!.length);
  });

  it("全ランクがデフォルトで販売中（is_active = true）", async () => {
    const { data } = await supabase.from("member_ranks").select("is_active");
    expect(data!.every((row) => row.is_active === true)).toBe(true);
  });

  it("enterpriseだけmonthly_limit_amountがNULL（無制限）で、他は正の金額", async () => {
    const { data } = await supabase
      .from("member_ranks")
      .select("code, monthly_limit_amount");

    const enterprise = data!.find((row) => row.code === "enterprise");
    expect(enterprise!.monthly_limit_amount).toBeNull();

    const others = data!.filter((row) => row.code !== "enterprise");
    expect(others.every((row) => (row.monthly_limit_amount ?? 0) > 0)).toBe(
      true
    );
  });

  it("codeの一意制約が効いている（重複INSERTはエラー）", async () => {
    const { error } = await supabase.from("member_ranks").insert({
      code: "starter",
      sort_order: 99,
      display_name_ja: "重複テスト",
    });

    expect(error).not.toBeNull();
  });
});
