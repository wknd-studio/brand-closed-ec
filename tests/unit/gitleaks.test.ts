import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";

/**
 * 機密情報（API キー・秘密鍵・トークン）の漏れを、gitleaks で PR ごと（CI）と
 * commit の前（pre-commit）に確かめる（#663）。
 * GitHub の secret scanning は GitHub が形を知っているサービスの鍵しか見ず、
 * ローカルでは commit の前に止められないため。
 */

const ROOT = path.resolve(__dirname, "../..");
const STAGED_SCRIPT = path.join(ROOT, "scripts/gitleaks-staged.sh");

type Step = {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Workflow = {
  on: { pull_request?: { branches?: string[] } };
  permissions?: Record<string, string>;
  jobs: Record<
    string,
    { name?: string; "runs-on"?: string; if?: string; steps: Step[] }
  >;
};

describe("CI の gitleaks のジョブ", () => {
  const workflow = parse(
    readFileSync(path.join(ROOT, ".github/workflows/secret-scan.yml"), "utf8")
  ) as Workflow;
  const job = workflow.jobs.gitleaks;

  it("develop・main への PR で動く（ブランチ保護の必須のチェックにするため、paths で絞らない）", () => {
    expect(workflow.on.pull_request?.branches?.sort()).toEqual([
      "develop",
      "main",
    ]);
    expect(job.name).toBe("Gitleaks");
    expect(job.if).toBeUndefined();
    expect(job["runs-on"]).toBe("ubuntu-24.04");
  });

  it("権限は読み取りだけ", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("PR の commit を辿れるよう、履歴を全部 checkout する", () => {
    const checkout = job.steps.find((s) =>
      s.uses?.startsWith("actions/checkout@")
    );
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
  });

  it("gitleaks を共通の手順で、版を固定してインストールしてから使う", () => {
    const install = job.steps.findIndex(
      (s) =>
        s.uses === "./.github/actions/install-cli" &&
        s.with?.tool === "gitleaks"
    );
    const scan = job.steps.findIndex((s) =>
      /\bgitleaks git\b/.test(s.run ?? "")
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(job.steps[install].with?.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(scan).toBeGreaterThan(install);
  });

  it("PR の base から head までの commit を調べ、見つけた値は伏せて出す", () => {
    const scan = job.steps.find((s) => /\bgitleaks git\b/.test(s.run ?? ""))!;
    expect(scan.run).toContain('--log-opts="$BASE_SHA..$HEAD_SHA"');
    expect(scan.run).toContain("--redact");
    // 検出時に失敗させる（終了コードを 0 にしない）
    expect(scan.run).not.toMatch(/--exit-code[ =]0\b/);
    expect(scan.run).not.toMatch(/\|\|\s*true/);
    // PR のタイトル等を run: に直接埋め込まず、SHA だけを env で渡す
    expect(scan.env).toEqual({
      BASE_SHA: "${{ github.event.pull_request.base.sha }}",
      HEAD_SHA: "${{ github.event.pull_request.head.sha }}",
    });
  });
});

describe(".gitleaks.toml", () => {
  const toml = readFileSync(path.join(ROOT, ".gitleaks.toml"), "utf8");
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n");

  // [[allowlists]] ごとに、本文（次の表の見出しまで）を取り出す
  const allowlists = toml
    .split(/^(?=\[)/m)
    .filter((block) => block.startsWith("[[allowlists]]"));

  // `key = [ '''...''', ... ]` の中の文字列を取り出す
  function stringsOf(block: string, key: string): string[] {
    const array = new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*$`, "m");
    const body = block.match(array)?.[1] ?? "";
    return [...body.matchAll(/'''(.*?)'''/g)].map((m) => m[1]);
  }

  it("gitleaks の既定のルールを使う（ルールを自前で持たない）", () => {
    expect(toml).toMatch(/^\[extend\]\s*\nuseDefault\s*=\s*true$/m);
    expect(toml).not.toMatch(/^\[\[rules\]\]/m);
  });

  it("全体の allowlist（[allowlist]）を使わない", () => {
    expect(toml).not.toMatch(/^\[allowlist\]/m);
  });

  it("誤検出の allowlist が1つ以上ある", () => {
    expect(allowlists.length).toBeGreaterThan(0);
  });

  it.each(allowlists.map((block, i) => [i, block]))(
    "allowlist %i は、理由を書き、ファイルと値の両方で絞る（ディレクトリ全体を外さない）",
    (_i, block) => {
      expect(block).toMatch(/^description\s*=\s*".+"$/m);
      expect(block).toMatch(/^condition\s*=\s*"AND"$/m);

      const paths = stringsOf(block, "paths");
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        // 1つのファイルの名前に完全一致させる（`.*`・`/` で終わる等、配下を丸ごと外す形にしない）
        expect(p, p).toMatch(/^\^.+\$$/);
        expect(p, p).not.toMatch(/\.\*|\.\+|\/\$$/);
        expect(
          tracked.filter((f) => new RegExp(p).test(f)),
          p
        ).toHaveLength(1);
      }

      const regexes = stringsOf(block, "regexes");
      expect(regexes.length).toBeGreaterThan(0);
      for (const r of regexes) {
        // 値は完全一致させる
        expect(r, r).toMatch(/^\^.+\$$/);
      }
    }
  );
});

describe("pre-commit の gitleaks（scripts/gitleaks-staged.sh）", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "gitleaks-staged-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // gitleaks を差し替え、受け取った引数を args に記録して exitCode で終わる
  function fakeGitleaks(exitCode: number) {
    const bin = path.join(dir, "bin");
    execFileSync("mkdir", ["-p", bin]);
    const fake = path.join(bin, "gitleaks");
    writeFileSync(
      fake,
      `#!/usr/bin/env bash\necho "$@" > "${dir}/args"\nexit ${exitCode}\n`
    );
    chmodSync(fake, 0o755);
    return bin;
  }

  function run(pathEnv: string) {
    const result = spawnSync("/bin/bash", [STAGED_SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: pathEnv },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  const SYSTEM_PATH = "/usr/bin:/bin";

  it("gitleaks が入っていなければ、入れ方を出して失敗する（黙って通さない）", () => {
    const { status, output } = run(SYSTEM_PATH);
    expect(status).not.toBe(0);
    expect(output).toContain("brew install gitleaks");
    expect(output).toContain("docs/cicd.md");
  });

  it("ステージした差分を調べ、見つけた値は伏せて出す", () => {
    const { status } = run(`${fakeGitleaks(0)}:${SYSTEM_PATH}`);
    expect(status).toBe(0);
    const args = readFileSync(path.join(dir, "args"), "utf8");
    expect(args).toContain("git --pre-commit --staged");
    expect(args).toContain("--redact");
  });

  it("gitleaks が検出したら失敗し、誤検出のときの扱いを出す", () => {
    const { status, output } = run(`${fakeGitleaks(1)}:${SYSTEM_PATH}`);
    expect(status).not.toBe(0);
    expect(output).toContain(".gitleaks.toml");
  });

  it(".husky/pre-commit が、lint-staged の前にこのスクリプトを呼ぶ", () => {
    const hook = readFileSync(path.join(ROOT, ".husky/pre-commit"), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"));
    expect(hook).toEqual([
      "bash scripts/gitleaks-staged.sh",
      "pnpm lint-staged",
    ]);
  });
});
