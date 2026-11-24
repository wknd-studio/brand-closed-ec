import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/db-schema-snapshot.sh");

const work = mkdtempSync(path.join(tmpdir(), "db-schema-snapshot-"));

function call(fn: string, ...args: string[]) {
  const result = spawnSync(
    "bash",
    ["-c", `source "$0" && ${fn} "$@"`, SCRIPT, ...args],
    { cwd: ROOT, encoding: "utf8" }
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("supabase/schemas の書き出し", () => {
  it("同じDBから2回書き出すと、同じ出力になる（並び順・空白・所有者が揺れない）", () => {
    const first = path.join(work, "first");
    const second = path.join(work, "second");

    expect(call("generate_schema", first).status).toBe(0);
    expect(call("generate_schema", second).status).toBe(0);

    const { status, output } = call("diff_schema_dirs", first, second);
    expect(output).not.toContain("::error::");
    expect(status).toBe(0);
  }, 60_000);

  it("関数のファイルに、その関数の今の定義がそのまま入る", () => {
    const out = path.join(work, "functions");
    expect(call("generate_schema", out).status).toBe(0);

    const result = spawnSync(
      "grep",
      ["-c", "CREATE OR REPLACE FUNCTION public.save_order", "-r", out],
      { encoding: "utf8" }
    );
    expect(result.stdout).toContain("public/functions/save_order.sql:1");
  }, 60_000);
});
