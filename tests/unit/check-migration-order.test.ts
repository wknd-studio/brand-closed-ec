import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/ci/check-migration-order.sh"
);

// スクリプトをsourceして判定関数だけを呼ぶ（gitには触れない）
function judge(baseFiles: string[], addedFiles: string[]) {
  const result = spawnSync(
    "bash",
    [
      "-c",
      'source "$0" && judge_migration_order "$1" "$2"',
      SCRIPT,
      baseFiles.join("\n"),
      addedFiles.join("\n"),
    ],
    { encoding: "utf8" }
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

const base = [
  "supabase/migrations/20260922020000_create_claim_stripe_webhook_event_function.sql",
  "supabase/migrations/20260922050100_add_member_type_columns_to_users.sql",
  "supabase/migrations/20260922010000_create_place_order_with_limit_check_function.sql",
];

describe("judge_migration_order", () => {
  it("追加したマイグレーションが無ければ成功する", () => {
    expect(judge(base, []).status).toBe(0);
  });

  it("developの最新より新しいタイムスタンプなら成功する", () => {
    expect(
      judge(base, ["supabase/migrations/20260922050101_add_x.sql"]).status
    ).toBe(0);
  });

  it("developの最新より古いタイムスタンプなら失敗し、対象ファイル・最新・直し方を出力する", () => {
    const added = "supabase/migrations/20260922045432_add_member_type.sql";
    const { status, output } = judge(base, [added]);
    expect(status).toBe(1);
    expect(output).toContain(added);
    expect(output).toContain("20260922050100");
    expect(output).toContain("supabase migration new");
    expect(output).toContain("supabase gen types");
  });

  it("developの最新と同じタイムスタンプなら失敗する", () => {
    expect(
      judge(base, ["supabase/migrations/20260922050100_dup.sql"]).status
    ).toBe(1);
  });

  it("複数追加のうち1つでも古ければ失敗し、古いものだけを列挙する", () => {
    const { status, output } = judge(base, [
      "supabase/migrations/20260923000000_new.sql",
      "supabase/migrations/20260901000000_old.sql",
    ]);
    expect(status).toBe(1);
    expect(output).toContain("20260901000000_old.sql");
    expect(output).not.toContain("20260923000000_new.sql");
  });

  it("developにマイグレーションが1つも無ければ成功する", () => {
    expect(
      judge([], ["supabase/migrations/20260101000000_init.sql"]).status
    ).toBe(0);
  });
});
