import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { minimatch } from "minimatch";

import { HIGH_RISK_LABEL, parseLabelGlobs } from "./review-checklists";

/**
 * issue の範囲外の high-risk のファイルの変更を止める（#795）。
 * 「high-risk」は .github/labeler.yml の high-risk のグロブ、「issue の範囲」は issue 本文の「触るファイル」。
 *
 * 判定はここにまとめ、次の2か所から使う。
 *   - PreToolUse hook（.claude/hooks/issue-scope-guard.ts）: Orca のワークツリーで、担当 issue の範囲外の
 *     high-risk のファイルを Edit・Write しようとしたら止める
 *   - PR の CI（.github/workflows/issue-scope.yml。このファイルの main）: 差分の high-risk のファイルのうち、
 *     `Closes #n` の issue の範囲外のものがあれば失敗する。人間が scope-approved ラベルを付けると成功扱い
 *
 * 仕組みの説明は docs/cicd.md「issue の範囲外の high-risk の変更を止める（Issue Scope）」。
 */

export const SCOPE_APPROVED_LABEL = "scope-approved";
const DEPENDABOT = "dependabot[bot]";

// ---------------------------------------------------------------------------
// high-risk の判定
// ---------------------------------------------------------------------------

export function loadHighRiskGlobs(labelerYaml: string): string[] {
  return parseLabelGlobs(labelerYaml)[HIGH_RISK_LABEL] ?? [];
}

/** actions/labeler と同じく minimatch を dot: true で使う（scripts/ci/review-checklists.ts と同じ） */
export function isHighRisk(file: string, highRiskGlobs: string[]): boolean {
  return highRiskGlobs.some((glob) => minimatch(file, glob, { dot: true }));
}

// ---------------------------------------------------------------------------
// issue の「触るファイル」
// ---------------------------------------------------------------------------

const TOUCH_FILES_LINE = /^(\s*)(?:[-*]\s*)?触るファイル\s*[:：]/;

/**
 * issue 本文の「- 触るファイル: ...」の行（と、その下に字下げして並べた箇条書き）からパスを読む。
 * バッククォートで囲んだものがあればそれだけを、無ければ読点・カンマ・空白で区切ったものを読む。
 * どちらも括弧の注記（「（新規）」等）は読まない。
 */
export function parseTouchFiles(issueBody: string): string[] {
  const lines = issueBody.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  lines.forEach((line, i) => {
    const match = TOUCH_FILES_LINE.exec(line);
    if (!match) return;
    parts.push(line.slice(match[0].length));
    const indent = match[1].length;
    for (const next of lines.slice(i + 1)) {
      if (next.trim() === "" || leadingSpaces(next) <= indent) break;
      parts.push(next.replace(/^\s*[-*]\s*/, ""));
    }
  });
  return parts.flatMap(extractPaths);
}

const leadingSpaces = (line: string) => line.length - line.trimStart().length;

function extractPaths(text: string): string[] {
  const quoted = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  if (quoted.length > 0) return quoted.filter(Boolean);
  return text
    .replace(/（[^）]*）|\([^)]*\)/g, " ")
    .split(/[、,，\s]+/)
    .filter(Boolean);
}

/** 「触るファイル」のパスは、ファイルそのもの・ディレクトリ（前方一致）・グロブのどれでも当たりとする */
export function isInTouchFiles(file: string, touchFiles: string[]): boolean {
  return touchFiles.some((raw) => {
    const entry = raw.replace(/^\.?\//, "");
    if (file === entry) return true;
    const dir = entry.endsWith("/") ? entry : `${entry}/`;
    if (file.startsWith(dir)) return true;
    return minimatch(file, entry, { dot: true });
  });
}

export function outOfScopeFiles(
  files: string[],
  {
    highRiskGlobs,
    touchFiles,
  }: { highRiskGlobs: string[]; touchFiles: string[] }
): string[] {
  return files.filter(
    (f) => isHighRisk(f, highRiskGlobs) && !isInTouchFiles(f, touchFiles)
  );
}

// ---------------------------------------------------------------------------
// PR の CI
// ---------------------------------------------------------------------------

/** PR 本文の `Closes #n`（GitHub がリンクする closes・fixes・resolves とその活用形） */
export function closingIssueNumbers(prBody: string): number[] {
  const numbers = [
    ...prBody.matchAll(
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi
    ),
  ].map((m) => Number(m[1]));
  return [...new Set(numbers)];
}

export type ScopeResult = {
  ok: boolean;
  outOfScope: string[];
  message: string;
};

export async function checkPullRequestScope({
  files,
  prBody,
  prAuthor,
  approved,
  highRiskGlobs,
  fetchIssueBody,
}: {
  files: string[];
  prBody: string;
  prAuthor: string;
  approved: boolean;
  highRiskGlobs: string[];
  fetchIssueBody: (issue: number) => Promise<string>;
}): Promise<ScopeResult> {
  // Dependabot のPRは issue 無しで扱う（CLAUDE.md「Dependabot のセキュリティ更新」）。
  // package.json・.github/ を変えるため high-risk が付き、人間が差分を精読する
  if (prAuthor === DEPENDABOT) {
    return {
      ok: true,
      outOfScope: [],
      message: "Dependabot のPRは issue が無いため検査しません",
    };
  }
  const highRisk = files.filter((f) => isHighRisk(f, highRiskGlobs));
  if (highRisk.length === 0) {
    return {
      ok: true,
      outOfScope: [],
      message: "high-risk のファイルの変更はありません",
    };
  }

  const issues = closingIssueNumbers(prBody);
  let outOfScope: string[];
  let reason: string;
  if (issues.length === 0) {
    outOfScope = highRisk;
    reason =
      "PR本文に `Closes #n` が無いため、high-risk のファイルの変更はすべて範囲外として扱います";
  } else {
    const touchFiles: string[] = [];
    for (const issue of issues) {
      try {
        touchFiles.push(...parseTouchFiles(await fetchIssueBody(issue)));
      } catch (error) {
        return finish({
          approved,
          outOfScope: highRisk,
          reason: `issue #${issue} の本文を取得できないため、high-risk のファイルの変更はすべて範囲外として扱います（${errorMessage(error)}）`,
        });
      }
    }
    outOfScope = outOfScopeFiles(highRisk, { highRiskGlobs, touchFiles });
    reason = `${issues.map((n) => `issue #${n}`).join("・")} の「触るファイル」に無い high-risk のファイルを変更しています`;
  }
  if (outOfScope.length === 0) {
    return {
      ok: true,
      outOfScope: [],
      message: `high-risk のファイルはすべて ${issues.map((n) => `issue #${n}`).join("・")} の「触るファイル」にあります`,
    };
  }
  return finish({ approved, outOfScope, reason });
}

function finish({
  approved,
  outOfScope,
  reason,
}: {
  approved: boolean;
  outOfScope: string[];
  reason: string;
}): ScopeResult {
  const lines = [
    `${reason}:`,
    ...outOfScope.map((f) => `- ${f}`),
    "",
    approved
      ? `${SCOPE_APPROVED_LABEL} ラベルが付いているため、上記の変更を承認済みとして成功扱いにします`
      : [
          "high-risk の変更は人間が差分を精読してからマージします。進め方:",
          "- issue の範囲外の変更なら、PRから外して別の issue に起票する",
          "- issue の範囲の変更なら、人間が issue の「触るファイル」に書き足して、このチェックを再実行する",
          `- 人間が差分を確かめて範囲外の変更を認めるなら、PRに ${SCOPE_APPROVED_LABEL} ラベルを付ける`,
        ].join("\n"),
  ];
  return { ok: approved, outOfScope, message: lines.join("\n") };
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// ---------------------------------------------------------------------------
// PreToolUse hook
// ---------------------------------------------------------------------------

export type EditDecision = { block: false } | { block: true; reason: string };

/**
 * high-risk に当たらないファイルは、担当 issue も本文も取得せずに通す（普段の編集を遅くしない）。
 * 担当 issue が無い（Orca のワークツリーでない・linkedIssue が無い）ときは止めない。
 */
export async function checkEditScope({
  filePath,
  projectDir,
  highRiskGlobs,
  linkedIssue,
  fetchIssueBody,
}: {
  filePath: string;
  projectDir: string;
  highRiskGlobs: string[];
  linkedIssue: () => Promise<number | null>;
  fetchIssueBody: (issue: number) => Promise<string>;
}): Promise<EditDecision> {
  const relative = path.isAbsolute(filePath)
    ? path.relative(projectDir, filePath)
    : path.normalize(filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { block: false };
  }
  const file = relative.split(path.sep).join("/");
  if (!isHighRisk(file, highRiskGlobs)) return { block: false };

  const issue = await linkedIssue();
  if (issue === null) return { block: false };

  let body: string;
  try {
    body = await fetchIssueBody(issue);
  } catch (error) {
    return {
      block: true,
      reason: [
        `担当 issue #${issue} の本文を取得できないため、high-risk のパス \`${file}\` の編集を止めました（安全側。#795）: ${errorMessage(error)}`,
        "gh の認証・ネットワークを確かめてからやり直す。解決しなければ作業を止めてユーザーに報告する",
      ].join("\n"),
    };
  }
  if (isInTouchFiles(file, parseTouchFiles(body))) return { block: false };
  return {
    block: true,
    reason: [
      `\`${file}\` は .github/labeler.yml の high-risk のパスで、担当 issue #${issue} の「触るファイル」にありません（issue の範囲外の high-risk の変更。#795）。`,
      "high-risk の変更は人間が差分を精読してからマージするため、issue の範囲外で変えるには人間の確認が要ります。進め方:",
      "- 範囲外の問題なら、変更せずに起票する（CLAUDE.md「並列開発（Orca）」の「担当外の問題」）。担当 issue の作業は、このファイルを変えずに続ける",
      "- 担当 issue の範囲でどうしても必要な変更なら、作業を止めてユーザーに報告し、人間に issue の「触るファイル」へ書き足してもらう（自分で issue 本文を書き換えない）",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// GitHub から issue の本文を取る（hook・CI 共通）
// ---------------------------------------------------------------------------

/** gh issue view は Projects (classic) を読みに行って失敗することがあるため、REST API で取る */
export function fetchIssueBodyWithGh(cwd?: string) {
  return async (issue: number): Promise<string> =>
    execFileSync(
      "gh",
      ["api", `repos/{owner}/{repo}/issues/${issue}`, "--jq", '.body // ""'],
      { encoding: "utf8", cwd, stdio: ["ignore", "pipe", "pipe"] }
    );
}

// ---------------------------------------------------------------------------
// CI の入口
// ---------------------------------------------------------------------------

async function main() {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error(
      "使い方: PR_BODY=... PR_AUTHOR=... APPROVED=true|false pnpm -s tsx scripts/ci/issue-scope.ts <base-ref> <head-ref>"
    );
    process.exit(2);
  }
  const files = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", `${base}...${head}`],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);
  const result = await checkPullRequestScope({
    files,
    prBody: process.env.PR_BODY ?? "",
    prAuthor: process.env.PR_AUTHOR ?? "",
    approved: process.env.APPROVED === "true",
    highRiskGlobs: loadHighRiskGlobs(
      readFileSync(".github/labeler.yml", "utf8")
    ),
    fetchIssueBody: fetchIssueBodyWithGh(),
  });
  console.log(result.message);
  if (!result.ok) process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  void main();
}
