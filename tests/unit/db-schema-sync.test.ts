import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/db-schema-sync.sh");

// スクリプトをsourceして関数だけを呼ぶ（DBには触れない）
function call(fn: string, ...args: string[]) {
  const result = spawnSync(
    "bash",
    ["-c", `source "$0" && ${fn} "$@"`, SCRIPT, ...args],
    { encoding: "utf8", cwd: ROOT }
  );
  return {
    status: result.status,
    stdout: result.stdout,
    output: result.stdout + result.stderr,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "db-schema-sync-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function workflow(name: string, body: string) {
  const file = path.join(dir, name);
  writeFileSync(file, body);
  return file;
}

describe("ci_supabase_version", () => {
  it("ワークフローで使う Supabase CLI の版が1つなら、それを返す", () => {
    const a = workflow(
      "a.yml",
      "        with: { tool: supabase, version: 2.116.0 }\n        with: { tool: doppler, version: 3.77.1 }\n"
    );
    const b = workflow(
      "b.yml",
      "        with: { tool: supabase, version: 2.116.0 }\n"
    );
    const { status, stdout } = call("ci_supabase_version", a, b);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("2.116.0");
  });

  it("版が複数あれば失敗し、見つけた版を出す（CIのジョブごとに版がずれないように）", () => {
    const a = workflow(
      "a.yml",
      "        with: { tool: supabase, version: 2.116.0 }\n        with: { tool: supabase, version: 2.102.0 }\n"
    );
    const { status, output } = call("ci_supabase_version", a);
    expect(status).not.toBe(0);
    expect(output).toContain("2.116.0");
    expect(output).toContain("2.102.0");
  });

  it("1つも無ければ失敗する（書き方が変わって検査が空振りしないように）", () => {
    const a = workflow("a.yml", "jobs: {}\n");
    expect(call("ci_supabase_version", a).status).not.toBe(0);
  });

  it("このリポジトリのワークフローは、すべて同じ版の Supabase CLI を使う", () => {
    const files = readdirSync(path.join(ROOT, ".github/workflows")).map((f) =>
      path.join(ROOT, ".github/workflows", f)
    );
    const { status, output } = call("ci_supabase_version", ...files);
    expect(output).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(status).toBe(0);
  });
});

describe("check_cli_version", () => {
  it("ローカルの版がCIと同じなら成功する", () => {
    expect(call("check_cli_version", "2.116.0", "2.116.0").status).toBe(0);
  });

  it("違えば失敗し、両方の版と入れ方を出す（版で sync の結果が変わるため）", () => {
    const { status, output } = call("check_cli_version", "2.122.1", "2.116.0");
    expect(status).not.toBe(0);
    expect(output).toContain("2.122.1");
    expect(output).toContain("2.116.0");
    expect(output).toContain("brew");
  });
});

describe("judge_sync_check", () => {
  it("sync がマイグレーションを作らなければ成功する", () => {
    expect(call("judge_sync_check", "").status).toBe(0);
  });

  it("作ったら失敗し、中身と直し方を出す", () => {
    const file = path.join(dir, "20261201000000_schema_sync_check.sql");
    writeFileSync(
      file,
      'GRANT EXECUTE ON FUNCTION "public"."delete_order"(uuid) TO "anon";\n'
    );
    const { status, output } = call("judge_sync_check", file);
    expect(status).toBe(1);
    expect(output).toContain('TO "anon"');
    expect(output).toContain("task db:sync");
    expect(output).toContain("task db:schema");
  });
});

describe("CI の Schema Files Drift", () => {
  const deploy = readFileSync(
    path.join(ROOT, ".github/workflows/deploy.yml"),
    "utf8"
  );
  const job =
    deploy
      .split(/\n {2}(?=[\w-]+:\n)/)
      .find((j) => j.startsWith("schema-files-drift:\n")) ?? "";

  it("スキーマのファイルとマイグレーションの差を sync で作り直して、差が無いことを確かめる", () => {
    const check = job.indexOf("bash scripts/db-schema-snapshot.sh --check");
    const sync = job.indexOf("bash scripts/db-schema-sync.sh --check");
    expect(check).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(check);
  });
});

describe("task db:sync", () => {
  it("ワークツリーのDBで db-schema-sync.sh を呼ぶ", () => {
    const taskfile = readFileSync(path.join(ROOT, "Taskfile.yml"), "utf8");
    const task = taskfile
      .split(/\n {2}(?=[\w:-]+:\n)/)
      .find((t) => t.startsWith("db:sync:\n"));
    expect(task).toContain(
      "bash scripts/with-worktree-db.sh bash scripts/db-schema-sync.sh"
    );
  });
});
