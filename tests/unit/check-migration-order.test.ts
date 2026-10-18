import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

// merge queue の一時ブランチを模した git リポジトリを作り、キューのモードで実行する
describe("check-migration-order.sh --merge-group", () => {
  let repo: string;

  function git(...args: string[]) {
    const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  }

  function commitMigration(name: string) {
    mkdirSync(path.join(repo, "supabase/migrations"), { recursive: true });
    writeFileSync(path.join(repo, "supabase/migrations", name), "select 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", name);
  }

  // develop（またはキューの1つ前）の上に、PRのブランチを --no-ff でマージする
  function queuePr(branch: string, migration: string) {
    const base = git("rev-parse", "HEAD");
    git("switch", "-q", "-c", branch, "develop");
    commitMigration(migration);
    git("switch", "-q", "--detach", base);
    git("merge", "-q", "--no-ff", "-m", `merge ${branch}`, branch);
    return git("rev-parse", "HEAD");
  }

  function run(baseSha: string, headSha: string) {
    const r = spawnSync("bash", [SCRIPT, "--merge-group", baseSha, headSha], {
      cwd: repo,
      encoding: "utf8",
    });
    return { status: r.status, output: r.stdout + r.stderr };
  }

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "migration-order-"));
    git("init", "-q", "-b", "develop");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    commitMigration("20260922050100_base.sql");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("キューの先頭のPRがdevelopの最新より新しければ成功する", () => {
    const base = git("rev-parse", "develop");
    const head = queuePr("pr-a", "20260922050101_a.sql");
    expect(run(base, head).status).toBe(0);
  });

  it("キューの先頭のPRがdevelopの最新より古ければ失敗する", () => {
    const base = git("rev-parse", "develop");
    const head = queuePr("pr-a", "20260922040000_a.sql");
    const { status, output } = run(base, head);
    expect(status).toBe(1);
    expect(output).toContain("20260922040000_a.sql");
  });

  it("キューで前に並んだPRのマイグレーションより古ければ失敗する", () => {
    const base = git("rev-parse", "develop");
    git("switch", "-q", "--detach", base);
    queuePr("pr-a", "20260923000000_a.sql");
    const head = queuePr("pr-b", "20260922060000_b.sql");
    const { status, output } = run(base, head);
    expect(status).toBe(1);
    expect(output).toContain("20260922060000_b.sql");
    expect(output).toContain("20260923000000");
  });

  it("キューの各PRが順にタイムスタンプが新しければ成功する", () => {
    const base = git("rev-parse", "develop");
    git("switch", "-q", "--detach", base);
    queuePr("pr-a", "20260923000000_a.sql");
    const head = queuePr("pr-b", "20260924000000_b.sql");
    expect(run(base, head).status).toBe(0);
  });

  it("存在しないSHAを渡されたら、チェック不要として素通りさせず失敗する", () => {
    const head = git("rev-parse", "develop");
    expect(run("0".repeat(40), head).status).not.toBe(0);
  });
});
