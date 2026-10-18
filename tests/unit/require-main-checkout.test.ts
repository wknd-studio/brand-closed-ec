import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/require-main-checkout.sh を、一時的なgitリポジトリ（メインのチェックアウト）と
// そこから作ったワークツリーにコピーして実行し、ワークツリーでだけ止まることを確認する。

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/require-main-checkout.sh"
);

let base: string;
let mainDir: string;
let worktreeDir: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function placeScript(root: string): string {
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  const dest = path.join(root, "scripts", "require-main-checkout.sh");
  copyFileSync(SCRIPT, dest);
  return dest;
}

function run(root: string) {
  return spawnSync("bash", [placeScript(root), "dev"], {
    cwd: root,
    encoding: "utf8",
  });
}

beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), "require-main-checkout-"));
  mainDir = path.join(base, "main");
  worktreeDir = path.join(base, "wt");
  mkdirSync(mainDir);
  git(mainDir, "init", "-q");
  git(
    mainDir,
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init"
  );
  git(mainDir, "worktree", "add", "-q", worktreeDir);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("require-main-checkout.sh", () => {
  it("メインのチェックアウトでは何も出さずに成功する", () => {
    const result = run(mainDir);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("ワークツリーでは理由と代わりの方法を出して失敗する", () => {
    const result = run(worktreeDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("task dev");
    expect(result.stderr).toContain("task test:integration");
    expect(result.stderr).toContain("task test:e2e");
    expect(result.stderr).toContain("git switch");
  });
});
