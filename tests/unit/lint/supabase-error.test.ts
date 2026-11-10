import { ESLint } from "eslint";
import { describe, it, expect } from "vitest";

// supabase-js の error を捨てる書き方のlint（#614）の回帰テスト。実際の eslint.config.mjs を読み込み、
// src/infrastructure/supabase/ のファイルとして lintText に渡す。
// supabase-js は失敗しても例外を投げず { data: null, error } を返すため、error を見ないと
// 書き込みの失敗が成功扱いに、読み取りの失敗が「見つからない」「0件」に化ける

const FILE = "src/infrastructure/supabase/sample-repository.ts";

const eslint = new ESLint();

async function messages(code: string, filePath = FILE) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(
    (m) =>
      m.ruleId === "no-restricted-syntax" ||
      m.ruleId === "@typescript-eslint/no-unused-vars"
  );
}

// クラスのメソッドの中に置く（実際のリポジトリと同じ形にする）
const inMethod = (body: string) => `
import type { SupabaseClient } from "@supabase/supabase-js";

export class SampleRepository {
  constructor(private readonly db: SupabaseClient) {}

  async run(id: string): Promise<unknown> {
${body}
  }
}
`;

const violations: { name: string; body: string }[] = [
  {
    name: "結果を受け取らずに書き込む",
    body: `    await this.db.from("addresses").delete().eq("id", id);
    return null;`,
  },
  {
    name: "rpc の結果を受け取らない",
    body: `    await this.db.rpc("delete_order", { p_order_id: id });
    return null;`,
  },
  {
    name: "data だけを分割代入する",
    body: `    const { data } = await this.db.from("addresses").select("id").eq("id", id).maybeSingle();
    return data;`,
  },
  {
    name: "count だけを分割代入する",
    body: `    const { count } = await this.db.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", id);
    return count;`,
  },
  {
    name: "結果を分割代入せず変数で受ける",
    body: `    const result = await this.db.from("addresses").select("id").eq("id", id);
    return result.data;`,
  },
  {
    name: "結果をそのまま返す",
    body: `    return await this.db.from("addresses").select("id").eq("id", id);`,
  },
  {
    name: "error を取り出して使わない",
    body: `    const { data, error } = await this.db.from("addresses").select("id").eq("id", id);
    return data;`,
  },
  {
    name: "名前を変えて取り出した error を使わない",
    body: `    const { data, error: selectError } = await this.db.from("addresses").select("id").eq("id", id);
    return data;`,
  },
];

const allowed: { name: string; body: string }[] = [
  {
    name: "if (error) throw error",
    body: `    const { data, error } = await this.db.from("addresses").select("id").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;`,
  },
  {
    name: "書き込みで error だけを取り出して投げる",
    body: `    const { error } = await this.db.from("addresses").delete().eq("id", id);
    if (error) throw error;
    return null;`,
  },
  {
    name: "名前を変えて取り出した error を投げる",
    body: `    const { count, error: countError } = await this.db.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", id);
    if (countError) throw new Error(countError.message);
    return count;`,
  },
  {
    name: "rpc の error を投げる",
    body: `    const { error } = await this.db.rpc("delete_order", { p_order_id: id });
    if (error) throw error;
    return null;`,
  },
  {
    name: "supabase-js 以外の await（自分のメソッド・Array.from）",
    body: `    const found = await this.find(id);
    const ids = await Promise.resolve(Array.from("abc"));
    return [found, ids];`,
  },
];

describe("supabase-js の error を捨てる書き方（#614）", () => {
  it.each(violations)("$name は lint で失敗する", async ({ body }) => {
    const result = await messages(inMethod(body));
    expect(result).not.toHaveLength(0);
  });

  it.each(allowed)("$name は lint で失敗しない", async ({ body }) => {
    const result = await messages(inMethod(body));
    expect(result).toEqual([]);
  });

  it("違反のメッセージで #614 と直し方を示す", async () => {
    const [message] = await messages(
      inMethod(`    await this.db.from("addresses").delete().eq("id", id);
    return null;`)
    );
    expect(message.message).toContain("if (error) throw error");
    expect(message.message).toContain("#614");
  });

  it("src/infrastructure/supabase/ の外（テスト等）は対象外", async () => {
    const result = await messages(
      inMethod(`    await this.db.from("addresses").delete().eq("id", id);
    return null;`),
      "tests/integration/sample.test.ts"
    );
    expect(result.filter((m) => m.ruleId === "no-restricted-syntax")).toEqual(
      []
    );
  });
});
