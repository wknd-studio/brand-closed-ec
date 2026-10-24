// #497 の動作確認用。わざと失敗させてSupabaseのログのアーティファクトを確かめる。PRのマージ前にrevertする
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

describe("#497 わざと失敗させる", () => {
  it("PostgRESTにリクエストしてから失敗する", async () => {
    const { error } = await supabase.from("member_ranks").select("code");
    expect(error).toBeNull();
    expect("intentional failure for #497").toBe("");
  });
});
