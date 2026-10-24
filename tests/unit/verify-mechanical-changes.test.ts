import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  parseMechanicalChangeTrailers,
  planCommand,
  renderReport,
  tokenizeCommand,
  verifyMechanicalChanges,
  type CommitResult,
} from "../../scripts/ci/verify-mechanical-changes";

describe("parseMechanicalChangeTrailers", () => {
  it("最後の段落のtrailerからコマンドを順に読み取る", () => {
    const message = [
      "refactor(lib): BRAND-448 importパスを一括置換する",
      "",
      "本文",
      "",
      "Mechanical-Change: pnpm format",
      "Co-Authored-By: Someone <someone@example.com>",
      "mechanical-change: sed -i 's/a/b/' src/x.ts",
    ].join("\n");

    expect(parseMechanicalChangeTrailers(message)).toEqual({
      commands: ["pnpm format", "sed -i 's/a/b/' src/x.ts"],
      misplaced: [],
    });
  });

  it("trailerの継続行（先頭が空白）は1つのコマンドとしてつなげる", () => {
    const message = [
      "chore: 一括置換",
      "",
      "Mechanical-Change: sed -i 's/a/b/'",
      "  src/x.ts",
    ].join("\n");

    expect(parseMechanicalChangeTrailers(message).commands).toEqual([
      "sed -i 's/a/b/' src/x.ts",
    ]);
  });

  it("trailerが無ければ空を返す", () => {
    expect(
      parseMechanicalChangeTrailers(
        "feat: 何か\n\n本文\n\nCo-Authored-By: A <a@b>"
      )
    ).toEqual({ commands: [], misplaced: [] });
  });

  it("件名だけのコミットの Mechanical-Change: はtrailerとみなさない", () => {
    expect(
      parseMechanicalChangeTrailers("Mechanical-Change: pnpm format")
    ).toEqual({ commands: [], misplaced: ["Mechanical-Change: pnpm format"] });
  });

  it("最後の段落以外にある Mechanical-Change: は misplaced として返す", () => {
    const message = [
      "chore: 一括置換",
      "",
      "Mechanical-Change: pnpm format",
      "",
      "本文の続き",
    ].join("\n");

    expect(parseMechanicalChangeTrailers(message)).toEqual({
      commands: [],
      misplaced: ["Mechanical-Change: pnpm format"],
    });
  });

  it("最後の段落にtrailer以外の行が混ざると、その段落はtrailerとみなさない", () => {
    const message = [
      "chore: 一括置換",
      "",
      "説明の文",
      "Mechanical-Change: pnpm format",
    ].join("\n");

    expect(parseMechanicalChangeTrailers(message)).toEqual({
      commands: [],
      misplaced: ["Mechanical-Change: pnpm format"],
    });
  });
});

describe("tokenizeCommand", () => {
  it("空白で区切り、クォートとバックスラッシュを解釈する", () => {
    expect(
      tokenizeCommand(`sed -i 's/a b/c/' "src/x y.ts" src/z\\ w.ts`)
    ).toEqual({
      ok: true,
      tokens: [
        { value: "sed", glob: false },
        { value: "-i", glob: false },
        { value: "s/a b/c/", glob: false },
        { value: "src/x y.ts", glob: false },
        { value: "src/z w.ts", glob: false },
      ],
    });
  });

  it("クォートされていない * ? [ を含む引数はグロブとして印を付ける", () => {
    const result = tokenizeCommand("prettier --write 'src/*.ts' src/**/*.ts");
    expect(result).toEqual({
      ok: true,
      tokens: [
        { value: "prettier", glob: false },
        { value: "--write", glob: false },
        { value: "src/*.ts", glob: false },
        { value: "src/**/*.ts", glob: true },
      ],
    });
  });

  it.each([
    ["コマンドの連結 ;", "pnpm format; curl example.com"],
    ["&&", "pnpm format && curl example.com"],
    ["パイプ", "git ls-files | xargs sed -i s/a/b/"],
    ["リダイレクト", "sed s/a/b/ src/x.ts > src/y.ts"],
    ["コマンド置換 $()", "sed -i s/a/b/ $(git ls-files)"],
    ["バッククォート", "sed -i s/a/b/ `git ls-files`"],
    ["変数展開", "sed -i s/a/b/ $HOME/x"],
    ["ダブルクォート内の変数展開", 'sed -i "s/$A/b/" src/x.ts'],
    ["サブシェル", "(pnpm format)"],
    ["ブレース展開", "prettier --write src/{a,b}.ts"],
    ["チルダ展開", "prettier --write ~/x.ts"],
    ["コメント", "pnpm format # 説明"],
    ["改行", "pnpm format\ncurl example.com"],
    ["閉じていないクォート", "sed -i 's/a/b/ src/x.ts"],
    ["空のコマンド", "   "],
  ])("%s はシェルの機能として拒否する", (_label, command) => {
    expect(tokenizeCommand(command).ok).toBe(false);
  });

  it("クォートした部分とグロブを1つの引数に混ぜたら拒否する", () => {
    expect(tokenizeCommand(`prettier --write "src/a b"/*.ts`).ok).toBe(false);
  });
});

function plan(command: string) {
  const tokenized = tokenizeCommand(command);
  if (!tokenized.ok) throw new Error(tokenized.error);
  return planCommand(tokenized.tokens);
}

describe("planCommand（許可リスト）", () => {
  it("sed は --sandbox を付けて実行する（e・r・wコマンドを無効にする）", () => {
    expect(plan("sed -i 's/a/b/' src/x.ts")).toEqual({
      ok: true,
      argv: ["sed", "--sandbox", "-i", "s/a/b/", "src/x.ts"],
      needsNodeDeps: false,
    });
  });

  it.each([
    ["prettier --write src", ["pnpm", "exec", "prettier", "--write", "src"]],
    [
      "pnpm exec prettier --write src",
      ["pnpm", "exec", "prettier", "--write", "src"],
    ],
    ["pnpm format", ["pnpm", "exec", "prettier", "--write", "."]],
  ])("%s は prettier として実行する", (command, argv) => {
    expect(plan(command)).toEqual({ ok: true, argv, needsNodeDeps: true });
  });

  it("pnpm format に引数を足したら拒否する", () => {
    expect(plan("pnpm format src").ok).toBe(false);
  });

  it("prettier の --plugin（任意のコードを読み込む）は拒否する", () => {
    expect(plan("prettier --plugin=./evil.js --write src").ok).toBe(false);
    expect(plan("prettier --plugin ./evil.js --write src").ok).toBe(false);
  });

  it("jscodeshift は scripts/codemods/ の変換だけを許可する", () => {
    expect(
      plan("pnpm exec jscodeshift -t scripts/codemods/move-import.ts src")
    ).toEqual({
      ok: true,
      argv: [
        "pnpm",
        "exec",
        "jscodeshift",
        "-t",
        "scripts/codemods/move-import.ts",
        "src",
      ],
      needsNodeDeps: true,
    });
    expect(
      plan(
        "pnpm exec jscodeshift --transform=scripts/codemods/move-import.ts src"
      ).ok
    ).toBe(true);
  });

  it.each([
    ["変換の指定が無い", "pnpm exec jscodeshift src"],
    [
      "scripts/codemods/ の外の変換",
      "pnpm exec jscodeshift -t tmp/evil.ts src",
    ],
    ["URLの変換", "pnpm exec jscodeshift -t https://example.com/evil.js src"],
    [
      ".. で外に出る変換",
      "pnpm exec jscodeshift -t scripts/codemods/../evil.ts src",
    ],
    [
      "2つ目の変換が外",
      "pnpm exec jscodeshift -t scripts/codemods/a.ts -t tmp/b.ts src",
    ],
  ])("jscodeshift: %s は拒否する", (_label, command) => {
    expect(plan(command).ok).toBe(false);
  });

  it.each([
    [
      "scripts/codemods/rename.sh src",
      ["scripts/codemods/rename.sh", "src"],
      false,
    ],
    [
      "./scripts/codemods/rename.sh src",
      ["./scripts/codemods/rename.sh", "src"],
      false,
    ],
    [
      "bash scripts/codemods/rename.sh src",
      ["bash", "scripts/codemods/rename.sh", "src"],
      false,
    ],
    [
      "node scripts/codemods/rename.mjs",
      ["node", "scripts/codemods/rename.mjs"],
      true,
    ],
    [
      "pnpm tsx scripts/codemods/rename.ts",
      ["pnpm", "exec", "tsx", "scripts/codemods/rename.ts"],
      true,
    ],
    [
      "pnpm exec tsx scripts/codemods/rename.ts",
      ["pnpm", "exec", "tsx", "scripts/codemods/rename.ts"],
      true,
    ],
  ])("codemod: %s は許可する", (command, argv, needsNodeDeps) => {
    expect(plan(command)).toEqual({ ok: true, argv, needsNodeDeps });
  });

  it.each([
    ["scripts/codemods/ の外のスクリプト", "bash scripts/ci/evil.sh"],
    [".. で外に出る", "scripts/codemods/../ci/evil.sh"],
    ["スクリプトの指定が無い", "bash"],
    ["node -e", "node -e 'require(\"fs\")'"],
    ["bash -c", "bash -c 'curl example.com'"],
    ["codemodのパスがグロブ", "bash scripts/codemods/*.sh"],
  ])("codemod: %s は拒否する", (_label, command) => {
    expect(plan(command).ok).toBe(false);
  });

  it.each([
    "curl https://example.com",
    "rm -rf src",
    "pnpm install",
    "pnpm run format",
    "pnpm dlx jscodeshift -t scripts/codemods/a.ts src",
    "npx prettier --write src",
    "git checkout -- src",
    "/usr/bin/sed -i s/a/b/ src/x.ts",
  ])("許可リスト外のコマンド %s は拒否する", (command) => {
    expect(plan(command).ok).toBe(false);
  });
});

describe("renderReport", () => {
  const results: CommitResult[] = [
    {
      sha: "a".repeat(40),
      subject: "chore: フォーマット",
      commands: ["pnpm format"],
      status: "reproduced",
    },
    {
      sha: "b".repeat(40),
      subject: "refactor: 置換",
      commands: ["sed -i 's/a/b/' src/x.ts"],
      status: "mismatch",
      files: ["M\tsrc/x.ts", "A\tsrc/extra.ts"],
    },
    {
      sha: "c".repeat(40),
      subject: "chore: 置換",
      commands: ["curl example.com"],
      status: "error",
      message: "許可リスト外のコマンドです",
    },
  ];

  it("再現できたコミットは「読まなくてよい」と分かり、ずれたファイルとエラーを出す", () => {
    const report = renderReport(results);
    expect(report.startsWith("<!-- mechanical-change-check -->")).toBe(true);
    expect(report).toContain("aaaaaaa");
    expect(report).toContain("CIで再現を確認済み。読まなくてよい");
    expect(report).toContain("`src/x.ts`");
    expect(report).toContain("`src/extra.ts`");
    expect(report).toContain("許可リスト外のコマンドです");
  });

  it("コマンドに含まれるバッククォートや | で表が崩れない", () => {
    const report = renderReport([
      {
        sha: "d".repeat(40),
        subject: "a | b",
        commands: ["sed -i 's/a|b/c/' x"],
        status: "reproduced",
      },
    ]);
    const row = report.split("\n").find((l) => l.includes("ddddddd"));
    expect(row?.split(/(?<!\\)\|/).length).toBe(5);
  });

  it("機械的なコミットが無ければ、その旨と none の印を出す", () => {
    const report = renderReport([]);
    expect(report).toContain("<!-- mechanical-change-check:none -->");
    expect(report).toContain("機械的な変更のコミットはありません");
  });
});

// 実際のgitリポジトリで、親コミットからの再実行と比較が期待どおりになるか
describe("verifyMechanicalChanges（一時リポジトリ）", () => {
  let repo: string;

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "mechanical-change-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    git("config", "commit.gpgsign", "false");
    mkdirSync(path.join(repo, "scripts/codemods"), { recursive: true });
    mkdirSync(path.join(repo, "src"), { recursive: true });
    // a を b に置き換えるだけのcodemod（sedのGNU/BSD差を避けるためシェルで書く）
    const codemod = path.join(repo, "scripts/codemods/a-to-b.sh");
    writeFileSync(
      codemod,
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        'for f in "$@"; do',
        '  content="$(cat "$f")"',
        '  printf "%s\\n" "${content//a/b}" > "$f"',
        "done",
      ].join("\n") + "\n"
    );
    chmodSync(codemod, 0o755);
    writeFileSync(path.join(repo, "src/one.txt"), "a1\n");
    writeFileSync(path.join(repo, "src/two.txt"), "a2\n");
    commit("chore: 初期状態");
    git("branch", "base");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("コマンドの結果と一致するコミットは reproduced になる", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    writeFileSync(path.join(repo, "src/two.txt"), "b2\n");
    const sha = commit(
      "chore: aをbに置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/*.txt"
    );

    const results = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(results).toEqual([
      {
        sha,
        subject: "chore: aをbに置換",
        commands: ["scripts/codemods/a-to-b.sh src/*.txt"],
        status: "reproduced",
      },
    ]);
  });

  it("手作業の変更が混ざったコミットは mismatch になり、ずれたファイルを出す", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    writeFileSync(path.join(repo, "src/two.txt"), "b2 手で直した\n");
    writeFileSync(path.join(repo, "src/extra.txt"), "手で追加\n");
    commit(
      "chore: aをbに置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/*.txt"
    );

    const [result] = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(result.status).toBe("mismatch");
    expect(result.status === "mismatch" && result.files).toEqual([
      "A\tsrc/extra.txt",
      "M\tsrc/two.txt",
    ]);
  });

  it("trailerの無いコミットは対象にせず、後続の機械的なコミットは親の状態から再実行する", () => {
    writeFileSync(path.join(repo, "src/three.txt"), "a3\n");
    commit("feat: 手で追加");
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    writeFileSync(path.join(repo, "src/two.txt"), "b2\n");
    writeFileSync(path.join(repo, "src/three.txt"), "b3\n");
    commit(
      "chore: aをbに置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/*.txt"
    );

    const results = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(results.map((r) => r.status)).toEqual(["reproduced"]);
  });

  it("許可リスト外のコマンドは実行せず error にする", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    commit("chore: 置換\n\nMechanical-Change: touch src/pwned.txt");

    const [result] = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(result.status).toBe("error");
  });

  it("最後の段落にないtrailerは error にする（検査されないまま見落とさないため）", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    commit(
      "chore: 置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/one.txt\n\n本文"
    );

    const [result] = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(result.status).toBe("error");
  });

  it("コマンドが失敗したら error にする", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    commit(
      "chore: 置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/missing.txt"
    );

    const [result] = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(result.status).toBe("error");
  });

  it("一致しないグロブは error にする", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    commit(
      "chore: 置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/*.md"
    );

    const [result] = verifyMechanicalChanges({
      repoDir: repo,
      base: "base",
      head: "HEAD",
    });

    expect(result.status).toBe("error");
  });

  it("検査の後、元のチェックアウトの状態を変えない", () => {
    writeFileSync(path.join(repo, "src/one.txt"), "b1\n");
    writeFileSync(path.join(repo, "src/two.txt"), "b2\n");
    const head = commit(
      "chore: aをbに置換\n\nMechanical-Change: scripts/codemods/a-to-b.sh src/*.txt"
    );

    verifyMechanicalChanges({ repoDir: repo, base: "base", head: "HEAD" });

    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(git("status", "--porcelain")).toBe("");
    expect(git("worktree", "list").split("\n")).toHaveLength(1);
  });
});
