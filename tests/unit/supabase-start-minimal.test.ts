import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/supabase-start-minimal.sh を、`supabase start --help` の出力と `supabase start` の
// 引数の記録だけを行う偽の supabase コマンドをPATHに置いて実行し、除外する名前を CLI が
// 受け付ける一覧と照合してから起動することを確認する。

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/supabase-start-minimal.sh");
const EXCLUDED = path.join(ROOT, "scripts/supabase-excluded-services.txt");

// Supabase CLI v2.116.0（CIで使うバージョン）の `supabase start --help` の --exclude の行
const CLI_EXCLUDABLE =
  "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

let binDir: string;
let argsFile: string;

function excludedNames(): string[] {
  return readFileSync(EXCLUDED, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

function run(excludable: string | null, ...args: string[]) {
  rmSync(argsFile, { force: true });
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      FAKE_EXCLUDABLE: excludable ?? "",
      FAKE_ARGS_FILE: argsFile,
    },
  });
}

beforeAll(() => {
  binDir = mkdtempSync(path.join(tmpdir(), "supabase-start-minimal-"));
  argsFile = path.join(binDir, "args.txt");
  const fake = path.join(binDir, "supabase");
  writeFileSync(
    fake,
    `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then
  echo "2.116.0"
  exit 0
fi
if [ "$1" = "start" ] && [ "$2" = "--help" ]; then
  echo "Flags:"
  if [ -n "$FAKE_EXCLUDABLE" ]; then
    echo "  -x, --exclude string     Names of containers to not start. [$FAKE_EXCLUDABLE]"
  fi
  echo "      --ignore-health-check    Ignore unhealthy services and exit 0"
  exit 0
fi
printf '%s\\n' "$@" > "$FAKE_ARGS_FILE"
`
  );
  chmodSync(fake, 0o755);
});

afterAll(() => {
  rmSync(binDir, { recursive: true, force: true });
});

describe("supabase-excluded-services.txt", () => {
  it("アプリが使う db・auth（gotrue）・rest（postgrest）・kong は除外しない", () => {
    const names = excludedNames();
    expect(names.length).toBeGreaterThan(0);
    for (const used of ["gotrue", "postgrest", "kong"]) {
      expect(names).not.toContain(used);
    }
  });

  it("analytics（logflare）と pg_meta（postgres-meta）を除外する", () => {
    expect(excludedNames()).toEqual(
      expect.arrayContaining(["logflare", "postgres-meta"])
    );
  });
});

describe("scripts/supabase-start-minimal.sh", () => {
  it("除外する名前がすべて CLI の一覧にあれば、-x にまとめて渡し、追加の引数もそのまま渡す", () => {
    const result = run(CLI_EXCLUDABLE, "--workdir", "/tmp/wt");

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(argsFile, "utf8").trim().split("\n")).toEqual([
      "start",
      "-x",
      excludedNames().join(","),
      "--workdir",
      "/tmp/wt",
    ]);
  });

  it("CLI の一覧に無い名前があれば、その名前を表示して起動せずに失敗する", () => {
    const withoutLogflare = CLI_EXCLUDABLE.replace("logflare,", "");
    const result = run(withoutLogflare);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("logflare");
    expect(existsSync(argsFile)).toBe(false);
  });

  it("--help から一覧を取り出せなければ、起動せずに失敗する", () => {
    const result = run(null);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--exclude");
    expect(existsSync(argsFile)).toBe(false);
  });
});

describe("除外指定の定義が1か所にまとまっている", () => {
  it("with-worktree-db.sh は supabase-start-minimal.sh で起動する", () => {
    const script = readFileSync(
      path.join(ROOT, "scripts/with-worktree-db.sh"),
      "utf8"
    );
    expect(script).toContain("scripts/supabase-start-minimal.sh");
    expect(script).not.toMatch(/supabase start\b[^\n]*(-x|--exclude)/);
  });

  it("CI（deploy.yml）は supabase start を直接呼ばず、supabase-start-minimal.sh で起動する", () => {
    const workflow = readFileSync(
      path.join(ROOT, ".github/workflows/deploy.yml"),
      "utf8"
    );
    expect(workflow).not.toMatch(/supabase start/);
    expect(
      workflow.match(/bash scripts\/supabase-start-minimal\.sh/g) ?? []
    ).toHaveLength(3);
  });

  it("CI でローカルSupabaseを起動するジョブの CLI は、一覧を照合したバージョン（v2.116.0）に揃っている", () => {
    const workflow = readFileSync(
      path.join(ROOT, ".github/workflows/deploy.yml"),
      "utf8"
    );
    const jobs = workflow.split(/\n {2}(?=[\w-]+:\n)/);
    const versions = jobs
      .filter((job) => job.includes("scripts/supabase-start-minimal.sh"))
      .map(
        (job) =>
          job.match(
            /supabase\/setup-cli@v1\s+with: \{ version: ([\d.]+) \}/
          )?.[1]
      );
    expect(versions).toEqual(["2.116.0", "2.116.0", "2.116.0"]);
  });
});
