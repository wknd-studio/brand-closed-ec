import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 機械的な変更のコミットを、親コミットの状態でコマンドを再実行して再現できるかを検査する（#474）。
 * 再現できたコミットは、人間がコミットメッセージのコマンドだけを読めばよい。
 *
 * 規約（CLAUDE.md「PRの粒度」）: 機械的な変更は専用のコミットにまとめ、実行したコマンドを
 * コミットメッセージの最後の段落に `Mechanical-Change: <コマンド>` のtrailerで書く（複数可・上から順に実行）。
 *
 * コミットメッセージのコマンドをCIで実行するため、次のように制限する:
 *   - シェルを通さずに実行する（; && | > $() 等のシェルの機能は拒否する）
 *   - 実行できるのは許可リスト（planCommand）のコマンドだけ
 *   - クォートされていないグロブ（* ? [）は、その時点のgit管理下のファイルに展開する
 *   - ワークフロー（.github/workflows/mechanical-change-check.yml）の権限は contents: read だけ・forkのPRは対象外
 *
 * 使い方: pnpm -s tsx scripts/ci/verify-mechanical-changes.ts <base-ref> <head-ref> [--report <file>]
 *   例: pnpm -s tsx scripts/ci/verify-mechanical-changes.ts origin/develop HEAD
 *   sed はGNU sed（CIのubuntu）で実行する。macOSのBSD sedでは --sandbox が無いため、ローカルでは sed を使うコミットを検査できない
 */

const TRAILER_KEY = "mechanical-change";
const REPORT_MARKER = "<!-- mechanical-change-check -->";
const NONE_MARKER = "<!-- mechanical-change-check:none -->";
const CODEMODS_DIR = "scripts/codemods/";
const REPLAY_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// trailerの読み取り
// ---------------------------------------------------------------------------

const TRAILER_LINE = /^([A-Za-z0-9][A-Za-z0-9-]*):\s*(.*)$/;

/**
 * コミットメッセージの最後の段落（件名以外）がすべてtrailer行なら、その中の Mechanical-Change を順に返す。
 * trailerとして読めない位置にある Mechanical-Change: 行は misplaced に返す（検査されないまま見落とさないため）
 */
export function parseMechanicalChangeTrailers(message: string): {
  commands: string[];
  misplaced: string[];
} {
  const paragraphs = message
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n[ \t]*\n/)
    .map((p) => p.split("\n"));

  const commands: string[] = [];
  const last = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : null;
  const isTrailerBlock =
    last !== null &&
    TRAILER_LINE.test(last[0]) &&
    last.every((line) => TRAILER_LINE.test(line) || /^[ \t]+\S/.test(line));

  if (isTrailerBlock) {
    let current: { key: string; value: string } | null = null;
    const flush = () => {
      if (current?.key.toLowerCase() === TRAILER_KEY) {
        commands.push(current.value.trim());
      }
    };
    for (const line of last) {
      const match = TRAILER_LINE.exec(line);
      if (match) {
        flush();
        current = { key: match[1], value: match[2] };
      } else if (current) {
        current.value += " " + line.trim();
      }
    }
    flush();
  }

  const misplaced = paragraphs
    .filter((p) => !(isTrailerBlock && p === last))
    .flat()
    .filter((line) => line.trim().toLowerCase().startsWith(`${TRAILER_KEY}:`))
    .map((line) => line.trim());

  return { commands, misplaced };
}

// ---------------------------------------------------------------------------
// コマンドの分解（シェルを通さないため、シェルの機能は拒否する）
// ---------------------------------------------------------------------------

export type Token = { value: string; glob: boolean };

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

// クォートの外で使うとシェルが特別に解釈する文字。シェルを通さないと意味が変わるため拒否する
const UNQUOTED_FORBIDDEN = new Set([
  ";",
  "&",
  "|",
  "<",
  ">",
  "(",
  ")",
  "$",
  "`",
  "{",
  "}",
  "#",
  "~",
  "!",
  "\n",
  "\r",
]);
const DOUBLE_QUOTED_FORBIDDEN = new Set(["$", "`", "!"]);
const GLOB_CHARS = new Set(["*", "?", "["]);

export function tokenizeCommand(command: string): Result<{ tokens: Token[] }> {
  const tokens: Token[] = [];
  let value = "";
  let inToken = false;
  let glob = false;
  let quoted = false;
  let i = 0;

  const fail = (error: string): Result<{ tokens: Token[] }> => ({
    ok: false,
    error: `${error}: ${command}`,
  });
  const push = () => {
    if (!inToken) return true;
    if (glob && quoted) return false;
    tokens.push({ value, glob });
    value = "";
    inToken = false;
    glob = false;
    quoted = false;
    return true;
  };

  while (i < command.length) {
    const c = command[i];
    if (c === " " || c === "\t") {
      if (!push()) {
        return fail("グロブとクォートを1つの引数に混ぜることはできません");
      }
      i++;
    } else if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) return fail("シングルクォートが閉じていません");
      value += command.slice(i + 1, end);
      inToken = quoted = true;
      i = end + 1;
    } else if (c === '"') {
      i++;
      inToken = quoted = true;
      for (;;) {
        if (i >= command.length) {
          return fail("ダブルクォートが閉じていません");
        }
        const d = command[i];
        if (d === '"') break;
        if (DOUBLE_QUOTED_FORBIDDEN.has(d)) {
          return fail(`シェルの展開（${d}）は使えません`);
        }
        if (d === "\\" && '"\\'.includes(command[i + 1] ?? "")) {
          value += command[i + 1];
          i += 2;
        } else {
          value += d;
          i++;
        }
      }
      i++;
    } else if (c === "\\") {
      if (i + 1 >= command.length) return fail("末尾のバックスラッシュ");
      value += command[i + 1];
      inToken = quoted = true;
      i += 2;
    } else if (UNQUOTED_FORBIDDEN.has(c)) {
      return fail(
        `シェルの機能（${JSON.stringify(c)}）は使えません。コマンドを分けて複数のtrailerに書いてください`
      );
    } else {
      if (GLOB_CHARS.has(c)) glob = true;
      value += c;
      inToken = true;
      i++;
    }
  }
  if (!push()) {
    return fail("グロブとクォートを1つの引数に混ぜることはできません");
  }
  if (tokens.length === 0) return fail("コマンドが空です");
  return { ok: true, tokens };
}

// ---------------------------------------------------------------------------
// 許可リスト
// ---------------------------------------------------------------------------

export type CommandPlan = {
  /** 先頭がプログラム。glob: true の要素は実行時にgit管理下のファイルへ展開する */
  argv: (string | Token)[];
  /** pnpm install 済みの node_modules が必要か */
  needsNodeDeps: boolean;
};

const ALLOWED_DESCRIPTION =
  "許可されているのは sed・prettier（pnpm exec prettier）・pnpm format・pnpm exec jscodeshift（-t scripts/codemods/...）・scripts/codemods/ のスクリプトだけです";

/** グロブのままのパスは、展開した結果が scripts/codemods/ の外を指しうるため認めない */
function isCodemodToken(t: Token | undefined): boolean {
  return t !== undefined && !t.glob && isCodemodPath(t.value);
}

function isCodemodPath(p: string): boolean {
  const normalized = p.startsWith("./") ? p.slice(2) : p;
  return (
    normalized.startsWith(CODEMODS_DIR) &&
    normalized.length > CODEMODS_DIR.length &&
    path.posix.normalize(normalized) === normalized &&
    !normalized.split("/").includes("..")
  );
}

/** 展開前の引数は、plan の結果ではグロブだけ Token のまま残し、それ以外は文字列にする */
function toArgs(tokens: Token[]): (string | Token)[] {
  return tokens.map((t) => (t.glob ? t : t.value));
}

export function planCommand(tokens: Token[]): Result<CommandPlan> {
  const words = tokens.map((t) => t.value);
  const reject = (reason: string): Result<CommandPlan> => ({
    ok: false,
    error: `${reason}（${words.join(" ")}）。${ALLOWED_DESCRIPTION}`,
  });
  const [w0, w1, w2] = words;

  if (w0 === "sed") {
    // GNU sedの --sandbox は e（シェル実行）・r・w（任意ファイルの読み書き）コマンドを無効にする
    return {
      ok: true,
      argv: ["sed", "--sandbox", ...toArgs(tokens.slice(1))],
      needsNodeDeps: false,
    };
  }

  const prettierArgs =
    w0 === "prettier"
      ? tokens.slice(1)
      : w0 === "pnpm" && w1 === "exec" && w2 === "prettier"
        ? tokens.slice(3)
        : null;
  if (prettierArgs) {
    // 安全の境界ではない（リポジトリのprettier設定でもpluginは読み込める）。
    // 境界は fork除外・contents: read・trailer無しのコミットを人間が読むこと
    if (prettierArgs.some((t) => /^--plugin(=|$)/.test(t.value))) {
      return reject("prettier の --plugin は使えません");
    }
    return {
      ok: true,
      argv: ["pnpm", "exec", "prettier", ...toArgs(prettierArgs)],
      needsNodeDeps: true,
    };
  }

  if (w0 === "pnpm" && w1 === "format") {
    if (words.length > 2) return reject("pnpm format には引数を付けられません");
    // package.json の scripts をたどると任意のコマンドを実行できるため、中身を固定して実行する
    return {
      ok: true,
      argv: ["pnpm", "exec", "prettier", "--write", "."],
      needsNodeDeps: true,
    };
  }

  if (w0 === "pnpm" && w1 === "exec" && w2 === "jscodeshift") {
    const args = tokens.slice(3);
    const transforms: (Token | undefined)[] = [];
    args.forEach((t, i) => {
      const inline = /^(?:-t|--transform)=(.*)$/.exec(t.value);
      if (inline) transforms.push({ value: inline[1], glob: t.glob });
      else if (t.value === "-t" || t.value === "--transform") {
        transforms.push(args[i + 1]);
      } else if (/^-t./.test(t.value)) {
        // -tpath の形は判定から漏れないよう、変換の指定として扱う
        transforms.push({ value: t.value.slice(2), glob: t.glob });
      }
    });
    if (transforms.length === 0) {
      return reject(
        "jscodeshift には -t scripts/codemods/... を指定してください"
      );
    }
    if (!transforms.every(isCodemodToken)) {
      return reject("jscodeshift の変換は scripts/codemods/ 配下だけです");
    }
    return {
      ok: true,
      argv: ["pnpm", "exec", "jscodeshift", ...toArgs(args)],
      needsNodeDeps: true,
    };
  }

  if (isCodemodToken(tokens[0])) {
    return { ok: true, argv: toArgs(tokens), needsNodeDeps: false };
  }
  if ((w0 === "bash" || w0 === "node") && w1 !== undefined) {
    if (!isCodemodToken(tokens[1])) {
      return reject(`${w0} で実行できるのは scripts/codemods/ 配下だけです`);
    }
    return { ok: true, argv: toArgs(tokens), needsNodeDeps: w0 === "node" };
  }
  const tsxScriptIndex =
    w0 === "pnpm" && w1 === "tsx"
      ? 2
      : w0 === "pnpm" && w1 === "exec" && w2 === "tsx"
        ? 3
        : null;
  if (tsxScriptIndex !== null) {
    if (!isCodemodToken(tokens[tsxScriptIndex])) {
      return reject("tsx で実行できるのは scripts/codemods/ 配下だけです");
    }
    return {
      ok: true,
      argv: ["pnpm", "exec", "tsx", ...toArgs(tokens.slice(tsxScriptIndex))],
      needsNodeDeps: true,
    };
  }

  return reject("許可リストにないコマンドです");
}

// ---------------------------------------------------------------------------
// 結果の出力
// ---------------------------------------------------------------------------

export type CommitResult = {
  sha: string;
  subject: string;
  commands: string[];
} & (
  | { status: "reproduced" }
  | { status: "mismatch"; files: string[] }
  | { status: "error"; message: string }
);

/** 表のセルに入れる。| と改行で表が崩れないようにし、バッククォートを含んでもコードとして出す */
function codeCell(text: string): string {
  const escaped = text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
  const fence = escaped.includes("`") ? "``" : "`";
  return `${fence} ${escaped} ${fence}`;
}

function textCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

const STATUS_LABEL: Record<CommitResult["status"], string> = {
  reproduced: "✅ CIで再現を確認済み。読まなくてよい",
  mismatch: "❌ コマンドの結果と一致しない",
  error: "❌ 検査できない",
};

export function renderReport(results: CommitResult[]): string {
  const lines = [REPORT_MARKER, "## 機械的な変更の再現チェック", ""];
  if (results.length === 0) {
    lines.push(
      NONE_MARKER,
      "機械的な変更のコミットはありません（`Mechanical-Change:` trailer付きのコミットが無い）。"
    );
    return lines.join("\n") + "\n";
  }

  lines.push(
    "`Mechanical-Change:` trailerのコマンドを親コミットの状態で再実行し、コミットの内容と比較した結果です。",
    "✅ のコミットは差分を読まず、コマンドが意図どおりかだけを確認してください（`scripts/codemods/` を変更している場合は、そのcodemodは別のコミットとして読む）。",
    "",
    "| コミット | 結果 | コマンド |",
    "| -------- | ---- | -------- |"
  );
  for (const r of results) {
    lines.push(
      `| ${r.sha.slice(0, 7)} ${textCell(r.subject)} | ${STATUS_LABEL[r.status]} | ${
        r.commands.map(codeCell).join("<br>") || "—"
      } |`
    );
  }

  const failures = results.filter((r) => r.status !== "reproduced");
  for (const r of failures) {
    lines.push("", `### ${r.sha.slice(0, 7)} ${r.subject}`, "");
    if (r.status === "mismatch") {
      lines.push(
        "コマンドの結果とコミットの内容がずれているファイル（手作業の変更が混ざっていれば、機械的なコミットと分けてください）:",
        "",
        ...r.files.map((f) => {
          const [status, ...paths] = f.split("\t");
          return `- ${status} ${paths.map((p) => `\`${p}\``).join(" → ")}`;
        })
      );
    } else if (r.status === "error") {
      lines.push("```", r.message, "```");
    }
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// 再実行と比較（gitに触れる）
// ---------------------------------------------------------------------------

function run(cwd: string, file: string, args: string[]): string {
  return execFileSync(file, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 実行するコマンドにトークン類を渡さない（ワークフロー側でも渡していないが、念のため） */
function commandEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/TOKEN|SECRET|PASSWORD|_KEY$|^GH_|^GITHUB_/i.test(key)
    )
  ) as NodeJS.ProcessEnv;
}

function expandGlob(cwd: string, pattern: string): string[] {
  return run(cwd, "git", ["ls-files", "-z", "--", `:(glob)${pattern}`])
    .split("\0")
    .filter(Boolean);
}

/** パスの文字列だけでは、scripts/codemods/ の外を指すsymlinkを通してしまうため、実体の場所を確かめる */
function assertCodemodsInside(dir: string, plan: CommandPlan) {
  for (const arg of plan.argv) {
    if (typeof arg !== "string") continue;
    const candidate = arg.replace(/^(?:-t|--transform)=?/, "");
    if (!isCodemodPath(candidate)) continue;
    let real: string;
    try {
      real = realpathSync(path.join(dir, candidate));
    } catch {
      continue; // 存在しないファイルはコマンド自体が失敗する
    }
    const codemodsRoot = realpathSync(path.join(dir, CODEMODS_DIR));
    if (!real.startsWith(codemodsRoot + path.sep)) {
      throw new Error(
        `${candidate} の実体が ${CODEMODS_DIR} の外にあります（${real}）`
      );
    }
  }
}

type Replay = {
  dir: string;
  installedLockfile: string | null;
};

function replayCommit(
  replay: Replay,
  sha: string,
  plans: CommandPlan[]
): { status: "reproduced" } | { status: "mismatch"; files: string[] } {
  const { dir } = replay;
  run(dir, "git", ["checkout", "-q", "-f", "--detach", `${sha}^`]);
  run(dir, "git", ["clean", "-q", "-fd"]);

  if (plans.some((p) => p.needsNodeDeps)) {
    const lockfile = run(dir, "git", [
      "rev-parse",
      "HEAD:pnpm-lock.yaml",
    ]).trim();
    if (replay.installedLockfile !== lockfile) {
      run(dir, "pnpm", ["install", "--frozen-lockfile", "--prefer-offline"]);
      replay.installedLockfile = lockfile;
    }
  }

  for (const plan of plans) {
    assertCodemodsInside(dir, plan);
    const argv: string[] = [];
    for (const arg of plan.argv) {
      if (typeof arg === "string") {
        argv.push(arg);
        continue;
      }
      const files = expandGlob(dir, arg.value);
      if (files.length === 0) {
        throw new Error(`グロブに一致するファイルがありません: ${arg.value}`);
      }
      argv.push(...files);
    }
    const [file, ...args] = argv;
    const result = spawnSync(file, args, {
      cwd: dir,
      encoding: "utf8",
      env: commandEnv(),
      timeout: REPLAY_COMMAND_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
        .trim()
        .split("\n")
        .slice(-20)
        .join("\n");
      throw new Error(
        `コマンドが失敗しました（${argv.join(" ")}）: ${
          result.error?.message ?? `exit ${result.status}`
        }\n${output}`
      );
    }
  }

  run(dir, "git", ["add", "-A"]);
  const replayed = run(dir, "git", ["write-tree"]).trim();
  const expected = run(dir, "git", ["rev-parse", `${sha}^{tree}`]).trim();
  if (replayed === expected) return { status: "reproduced" };

  // 再実行した結果から見て、コミットに余分に入っている変更（= 手作業の変更）を出す
  const files = run(dir, "git", [
    "diff",
    "--name-status",
    "--no-renames",
    replayed,
    expected,
  ])
    .split("\n")
    .filter(Boolean);
  return { status: "mismatch", files };
}

export function verifyMechanicalChanges(options: {
  repoDir: string;
  base: string;
  head: string;
}): CommitResult[] {
  const { repoDir, base, head } = options;
  const commits = run(repoDir, "git", [
    "rev-list",
    "--reverse",
    "--parents",
    `${base}..${head}`,
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, ...parents] = line.split(" ");
      return { sha, parents };
    });

  const results: CommitResult[] = [];
  let replay: Replay | null = null;
  try {
    for (const { sha, parents } of commits) {
      const message = run(repoDir, "git", ["log", "-1", "--format=%B", sha]);
      const { commands, misplaced } = parseMechanicalChangeTrailers(message);
      if (commands.length === 0 && misplaced.length === 0) continue;

      const subject = message.split("\n")[0];
      const error = (msg: string) =>
        results.push({ sha, subject, commands, status: "error", message: msg });

      if (misplaced.length > 0) {
        error(
          `Mechanical-Change: がtrailerとして読めません（コミットメッセージの最後の段落に、trailer行だけを並べてください）:\n${misplaced.join("\n")}`
        );
        continue;
      }
      if (parents.length !== 1) {
        error("マージコミットは機械的な変更として検査できません");
        continue;
      }

      const plans: CommandPlan[] = [];
      const errors: string[] = [];
      for (const command of commands) {
        const tokenized = tokenizeCommand(command);
        const planned = tokenized.ok
          ? planCommand(tokenized.tokens)
          : tokenized;
        if (planned.ok) plans.push(planned);
        else errors.push(planned.error);
      }
      if (errors.length > 0) {
        error(errors.join("\n"));
        continue;
      }

      if (!replay) {
        const dir = path.join(
          mkdtempSync(path.join(tmpdir(), "mechanical-change-replay-")),
          "repo"
        );
        run(repoDir, "git", [
          "worktree",
          "add",
          "-q",
          "--detach",
          dir,
          `${sha}^`,
        ]);
        replay = { dir, installedLockfile: null };
      }
      try {
        results.push({
          sha,
          subject,
          commands,
          ...replayCommit(replay, sha, plans),
        });
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
    }
  } finally {
    if (replay) {
      run(repoDir, "git", ["worktree", "remove", "--force", replay.dir]);
      rmSync(path.dirname(replay.dir), { recursive: true, force: true });
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const reportIndex = args.indexOf("--report");
  const reportPath = reportIndex === -1 ? null : args[reportIndex + 1];
  const [base, head = "HEAD"] = args.filter(
    (_, i) => reportIndex === -1 || (i !== reportIndex && i !== reportIndex + 1)
  );
  if (!base) {
    console.error(
      "使い方: pnpm -s tsx scripts/ci/verify-mechanical-changes.ts <base-ref> <head-ref> [--report <file>]"
    );
    process.exit(2);
  }

  const results = verifyMechanicalChanges({
    repoDir: process.cwd(),
    base,
    head,
  });
  const report = renderReport(results);
  if (reportPath) writeFileSync(reportPath, report);
  console.log(report);

  const failed = results.filter((r) => r.status !== "reproduced");
  if (failed.length > 0) {
    for (const r of failed) {
      console.log(
        `::error::${r.sha.slice(0, 7)} ${r.subject}: ${
          r.status === "mismatch"
            ? `コマンドの結果と一致しません（${r.files.length}ファイル）`
            : r.message.split("\n")[0]
        }`
      );
    }
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
