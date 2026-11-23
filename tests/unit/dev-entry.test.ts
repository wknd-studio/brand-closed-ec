import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

// scripts/dev-entry.sh（Webhookの入口 = ngrok・stripe listen の鍵）と scripts/dev-run.sh（入口の転送先のポート）を、
// 一時的なgitリポジトリ（メインのチェックアウト）とそこから作ったワークツリーにコピーして実行する。
// doppler・ngrok・with-worktree-db.sh は引数を出力するだけの偽物に差し替え、実際には何も起動しない。

const ROOT = path.resolve(__dirname, "../..");
const SCRIPTS = ["dev-entry.sh", "dev-run.sh", "worktree-slot-lib.sh"];

// 確実に存在しないPID（pid_max を超える値）
const DEAD_PID = "99999999";
const ALIVE_PID = String(process.pid);

let base: string;
let mainDir: string;
let worktreeDir: string;
let binDir: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function placeScripts(root: string): void {
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  for (const name of SCRIPTS) {
    copyFileSync(
      path.join(ROOT, "scripts", name),
      path.join(root, "scripts", name)
    );
  }
  copyFileSync(path.join(ROOT, "ngrok.yml"), path.join(root, "ngrok.yml"));
  // ワークツリーの Next.js は with-worktree-db.sh（スロットのDB・ポート）を通して起動する
  writeFileSync(
    path.join(root, "scripts", "with-worktree-db.sh"),
    'echo "with-worktree-db.sh $*"\n'
  );
}

function fakeBin(name: string, body: string): void {
  const file = path.join(binDir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

function run(
  root: string,
  script: "dev-entry.sh" | "dev-run.sh",
  args: string[],
  pid: string = ALIVE_PID
) {
  return spawnSync("bash", [path.join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      // 入口の持ち主のプロセス（task dev）。既定は呼び出し元（task）のPID
      DEV_ENTRY_PID: pid,
    },
  });
}

function entryDir(): string {
  return path.join(mainDir, ".git", "dev-entry");
}

function ownSlot(root: string): number {
  const slotsDir = path.join(mainDir, ".git", "worktree-slots");
  for (let n = 2; n <= 9; n++) {
    const owner = path.join(slotsDir, String(n), "owner");
    if (existsSync(owner) && readFileSync(owner, "utf8").trim() === root) {
      return n;
    }
  }
  throw new Error(`スロットが確保されていません: ${root}`);
}

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "dev-entry-"));
  mainDir = path.join(base, "main");
  worktreeDir = path.join(base, "wt");
  binDir = path.join(base, "bin");
  mkdirSync(mainDir);
  mkdirSync(binDir);
  git(mainDir, "init", "-q", "-b", "develop");
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
  git(
    mainDir,
    "worktree",
    "add",
    "-q",
    "-b",
    "feature/123-some-issue",
    worktreeDir
  );
  // realpath で比べる（macOSの /var → /private/var）
  mainDir = execFileSync("pwd", ["-P"], {
    cwd: mainDir,
    encoding: "utf8",
  }).trim();
  worktreeDir = execFileSync("pwd", ["-P"], {
    cwd: worktreeDir,
    encoding: "utf8",
  }).trim();
  placeScripts(mainDir);
  placeScripts(worktreeDir);
  fakeBin("doppler", 'echo "doppler $*"');
  // 2つ目の --config（入口用の設定）の中身も出力する
  fakeBin(
    "ngrok",
    'echo "ngrok $*"; for a in "$@"; do last="$a"; done; cat "$last"'
  );
  // 実際のスロットのSupabaseコンテナの有無で結果が変わらないよう、コンテナが無いことにする
  fakeBin("docker", "exit 0");
  fakeBin("supabase", 'echo "supabase $*"');
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("dev-entry.sh（入口の確保）", () => {
  it("メインのチェックアウトで入口を確保できる", () => {
    const result = run(mainDir, "dev-entry.sh", ["dev"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(entryDir(), "owner"), "utf8").trim()).toBe(
      mainDir
    );
  });

  it("ワークツリーで入口を確保できる", () => {
    const result = run(worktreeDir, "dev-entry.sh", ["dev"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(entryDir(), "owner"), "utf8").trim()).toBe(
      worktreeDir
    );
  });

  it("確保済みの場所でもう一度確保しても成功する（task dev の中の dev:next・別ウィンドウの dev:ngrok）", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"]).status).toBe(0);
    const again = run(worktreeDir, "dev-entry.sh", ["dev:ngrok"], DEAD_PID);
    expect(again.status, again.stderr).toBe(0);
  });

  it("ワークツリーが使用中なら、メインのチェックアウトはそのパスとissueを出して止まる", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"]).status).toBe(0);
    const result = run(mainDir, "dev-entry.sh", ["dev"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(worktreeDir);
    expect(result.stderr).toContain("#123");
    expect(result.stderr).toContain("task dev:clean");
    expect(readFileSync(path.join(entryDir(), "owner"), "utf8").trim()).toBe(
      worktreeDir
    );
  });

  it("メインのチェックアウトが使用中なら、ワークツリーはそのパスを出して止まる", () => {
    expect(run(mainDir, "dev-entry.sh", ["dev"]).status).toBe(0);
    const result = run(worktreeDir, "dev-entry.sh", ["dev:stripe"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(mainDir);
  });

  it("持ち主のプロセスがすべて終了していれば（異常終了）、別の場所が回収して確保する", () => {
    expect(run(mainDir, "dev-entry.sh", ["dev"], DEAD_PID).status).toBe(0);
    const result = run(worktreeDir, "dev-entry.sh", ["dev"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(entryDir(), "owner"), "utf8").trim()).toBe(
      worktreeDir
    );
  });

  it("持ち主のプロセスが1つでも動いていれば（別ウィンドウの ngrok 等）、回収しない", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"], DEAD_PID).status).toBe(0);
    expect(run(worktreeDir, "dev-entry.sh", ["dev:ngrok"]).status).toBe(0);
    expect(run(mainDir, "dev-entry.sh", ["dev"]).status).not.toBe(0);
  });

  it("持ち主のワークツリーが削除されていれば、プロセスが動いていても回収して確保する", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"]).status).toBe(0);
    rmSync(worktreeDir, { recursive: true, force: true });
    const result = run(mainDir, "dev-entry.sh", ["dev"]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(entryDir(), "owner"), "utf8").trim()).toBe(
      mainDir
    );
  });
});

describe("dev-entry.sh --release（入口を返す）", () => {
  it("持ち主が返すと、別の場所で確保できる", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"]).status).toBe(0);
    const release = run(worktreeDir, "dev-entry.sh", ["--release"]);
    expect(release.status, release.stderr).toBe(0);
    expect(existsSync(entryDir())).toBe(false);
    expect(run(mainDir, "dev-entry.sh", ["dev"]).status).toBe(0);
  });

  it("持ち主でない場所は返せず、使用中の場所を出して止まる", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"]).status).toBe(0);
    const release = run(mainDir, "dev-entry.sh", ["--release"]);
    expect(release.status).not.toBe(0);
    expect(release.stderr).toContain(worktreeDir);
    expect(existsSync(entryDir())).toBe(true);
  });

  it("持ち主が消えた入口は、どこからでも返せる", () => {
    expect(run(worktreeDir, "dev-entry.sh", ["dev"], DEAD_PID).status).toBe(0);
    const release = run(mainDir, "dev-entry.sh", ["--release"]);
    expect(release.status, release.stderr).toBe(0);
    expect(existsSync(entryDir())).toBe(false);
  });

  it("誰も確保していなければ何もせず成功する", () => {
    const release = run(mainDir, "dev-entry.sh", ["--release"]);
    expect(release.status, release.stderr).toBe(0);
  });
});

describe("dev-run.sh（転送先のポート）", () => {
  it("メインのチェックアウトの Next.js はポート3000で、Dopplerの値のまま起動する", () => {
    const result = run(mainDir, "dev-run.sh", ["next"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^doppler run -- pnpm next dev --turbo --port 3000$/m
    );
  });

  it("メインのチェックアウトの stripe listen は localhost:3000 へ転送する", () => {
    const result = run(mainDir, "dev-run.sh", ["stripe"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "stripe listen --forward-to localhost:3000/api/webhooks/stripe"
    );
  });

  it("メインのチェックアウトの ngrok は 3000 へ転送する", () => {
    const result = run(mainDir, "dev-run.sh", ["ngrok"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("ngrok start default");
    expect(result.stdout).toMatch(/^\s*addr: 3000$/m);
    expect(result.stdout).toContain(
      "domain: buffing-flaccid-nutty.ngrok-free.dev"
    );
  });

  it("ワークツリーの Next.js は、スロットのDB（with-worktree-db.sh）とスロットのポートで起動する", () => {
    const result = run(worktreeDir, "dev-run.sh", ["next"]);
    expect(result.status, result.stderr).toBe(0);
    const port = 3000 + ownSlot(worktreeDir) - 1;
    expect(port).toBeGreaterThanOrEqual(3001);
    expect(result.stdout).toMatch(
      new RegExp(
        `^with-worktree-db.sh pnpm next dev --turbo --port ${port}$`,
        "m"
      )
    );
  });

  it("ワークツリーの stripe listen・ngrok は、そのスロットのポートへ転送する", () => {
    const stripe = run(worktreeDir, "dev-run.sh", ["stripe"]);
    const ngrok = run(worktreeDir, "dev-run.sh", ["ngrok"]);
    expect(stripe.status, stripe.stderr).toBe(0);
    expect(ngrok.status, ngrok.stderr).toBe(0);
    const port = 3000 + ownSlot(worktreeDir) - 1;
    expect(stripe.stdout).toContain(
      `stripe listen --forward-to localhost:${port}/api/webhooks/stripe`
    );
    expect(ngrok.stdout).toMatch(new RegExp(`^\\s*addr: ${port}$`, "m"));
    expect(ngrok.stdout).toContain(
      "domain: buffing-flaccid-nutty.ngrok-free.dev"
    );
  });

  it("ngrok.yml そのものは書き換えない", () => {
    const before = readFileSync(path.join(worktreeDir, "ngrok.yml"), "utf8");
    expect(run(worktreeDir, "dev-run.sh", ["ngrok"]).status).toBe(0);
    expect(readFileSync(path.join(worktreeDir, "ngrok.yml"), "utf8")).toBe(
      before
    );
  });

  it("メインのチェックアウトの supabase は既定の設定（スロット1）で起動し、シードは投入しない（今までどおり）", () => {
    const supabase = run(mainDir, "dev-run.sh", ["supabase"]);
    const seed = run(mainDir, "dev-run.sh", ["seed"]);
    expect(supabase.status, supabase.stderr).toBe(0);
    expect(supabase.stdout).toMatch(/^supabase start$/m);
    expect(seed.status, seed.stderr).toBe(0);
    expect(seed.stdout).toBe("");
  });

  it("ワークツリーの supabase・シードは、スロットのDB（with-worktree-db.sh）に対して行う", () => {
    const supabase = run(worktreeDir, "dev-run.sh", ["supabase"]);
    const seed = run(worktreeDir, "dev-run.sh", ["seed"]);
    expect(supabase.status, supabase.stderr).toBe(0);
    expect(supabase.stdout).toMatch(/^with-worktree-db.sh true$/m);
    expect(seed.status, seed.stderr).toBe(0);
    expect(seed.stdout).toMatch(
      /^with-worktree-db.sh pnpm -s tsx scripts\/seed-if-missing.ts$/m
    );
  });

  it("知らないサブコマンドはエラーで止まる", () => {
    expect(run(mainDir, "dev-run.sh", ["unknown"]).status).not.toBe(0);
  });
});

type Taskfile = {
  tasks: Record<string, { cmds: (string | { cmd?: string; task?: string })[] }>;
};

function commandsOf(task: string): string[] {
  const taskfile = parse(readFileSync("Taskfile.yml", "utf8")) as Taskfile;
  return taskfile.tasks[task].cmds.map((c) =>
    typeof c === "string" ? c : (c.cmd ?? `task: ${c.task}`)
  );
}

describe("Taskfile.yml の task dev 一式", () => {
  it.each([
    "dev",
    "dev:services",
    "dev:next",
    "dev:stripe",
    "dev:ngrok",
    "dev:ngrok:spawn",
    // 別の場所が使用中なら、その場所のプロセスを止める前に止まる
    "dev:clean",
  ])("%s は最初に入口を確保する", (task) => {
    expect(commandsOf(task)[0]).toBe('bash scripts/dev-entry.sh "{{.TASK}}"');
  });

  it("dev:clean は最後に入口を返す", () => {
    const cmds = commandsOf("dev:clean");
    expect(cmds.at(-1)).toBe("bash scripts/dev-entry.sh --release");
  });

  it.each([
    ["dev:next", "next"],
    ["dev:stripe", "stripe"],
    ["dev:ngrok", "ngrok"],
  ])(
    "%s は dev-run.sh で入口の転送先のポートに合わせて起動する",
    (task, sub) => {
      expect(commandsOf(task)).toContain(`bash scripts/dev-run.sh ${sub}`);
    }
  );

  it("dev はワークツリーで入口を取るとき、シードのテストアカウントが無ければ投入する", () => {
    expect(commandsOf("dev")).toContain("bash scripts/dev-run.sh seed");
  });

  it("ワークツリーでの task dev を止めるガード（require-main-checkout.sh）はもう使わない", () => {
    expect(readFileSync("Taskfile.yml", "utf8")).not.toContain(
      "require-main-checkout"
    );
  });
});
