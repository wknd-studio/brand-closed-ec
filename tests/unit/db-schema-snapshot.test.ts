import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "../../scripts/db-schema-snapshot.sh");

// スクリプトをsourceして関数だけを呼ぶ（DBには触れない）
function call(fn: string, ...args: string[]) {
  const result = spawnSync(
    "bash",
    ["-c", `source "$0" && ${fn} "$@"`, SCRIPT, ...args],
    { encoding: "utf8" }
  );
  return { status: result.status, output: result.stdout + result.stderr };
}

let work: string;
let generated: string;
let committed: string;

function put(dir: string, file: string, content: string) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
}

beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), "db-schema-snapshot-"));
  generated = path.join(work, "generated");
  committed = path.join(work, "schemas");
  mkdirSync(generated);
  mkdirSync(committed);
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("replace_schema_dir", () => {
  it("書き出した内容で置き換え、書き出しに無くなったファイルは消す", () => {
    put(generated, "public/functions/save_order.sql", "new\n");
    put(generated, ".pgdelta-export.json", "{}\n");
    put(committed, "public/functions/save_order.sql", "old\n");
    put(committed, "public/functions/dropped.sql", "old\n");

    expect(call("replace_schema_dir", generated, committed).status).toBe(0);

    expect(
      readFileSync(
        path.join(committed, "public/functions/save_order.sql"),
        "utf8"
      )
    ).toBe("new\n");
    expect(existsSync(path.join(committed, ".pgdelta-export.json"))).toBe(true);
    expect(
      existsSync(path.join(committed, "public/functions/dropped.sql"))
    ).toBe(false);
  });

  it("README.md（手で書いた説明）は残す", () => {
    put(generated, "public/schema.sql", "x\n");
    put(committed, "README.md", "直接編集しない\n");

    expect(call("replace_schema_dir", generated, committed).status).toBe(0);

    expect(readFileSync(path.join(committed, "README.md"), "utf8")).toBe(
      "直接編集しない\n"
    );
  });

  it("書き出し先が無ければ作る", () => {
    put(generated, "public/schema.sql", "x\n");
    const dest = path.join(work, "missing");

    expect(call("replace_schema_dir", generated, dest).status).toBe(0);

    expect(existsSync(path.join(dest, "public/schema.sql"))).toBe(true);
  });
});

describe("diff_schema_dirs", () => {
  it("同じなら成功する（README.md の有無は比べない）", () => {
    put(generated, "public/schema.sql", "x\n");
    put(committed, "public/schema.sql", "x\n");
    put(committed, "README.md", "説明\n");

    expect(call("diff_schema_dirs", generated, committed).status).toBe(0);
  });

  it("中身が違えば失敗し、ずれたファイルと直し方を出す", () => {
    put(generated, "public/functions/save_order.sql", "new\n");
    put(committed, "public/functions/save_order.sql", "old\n");

    const { status, output } = call("diff_schema_dirs", generated, committed);

    expect(status).toBe(1);
    expect(output).toContain("public/functions/save_order.sql");
    expect(output).toContain("task db:schema");
  });

  it("書き出しにだけある・コミット済みにだけあるファイルも、ずれとして出す", () => {
    put(generated, "public/functions/added.sql", "x\n");
    put(committed, "public/functions/dropped.sql", "x\n");

    const { status, output } = call("diff_schema_dirs", generated, committed);

    expect(status).toBe(1);
    expect(output).toContain("public/functions/added.sql");
    expect(output).toContain("public/functions/dropped.sql");
  });
});

describe("CI の Schema Files Drift", () => {
  const workflow = readFileSync(
    path.resolve(__dirname, "../../.github/workflows/deploy.yml"),
    "utf8"
  );
  const job =
    workflow
      .split(/\n {2}(?=[\w-]+:\n)/)
      .find((j) => j.startsWith("schema-files-drift:\n")) ?? "";

  it("PRで、マイグレーションを当てたDBから書き出し直してコミット済みと比べる", () => {
    expect(job).toContain("name: Schema Files Drift");
    expect(job).toContain("if: github.event_name == 'pull_request'");
    const reset = job.indexOf("supabase db reset");
    const check = job.indexOf("bash scripts/db-schema-snapshot.sh --check");
    expect(reset).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(reset);
  });
});
