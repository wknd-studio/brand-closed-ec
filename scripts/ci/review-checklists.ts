import { readFileSync } from "node:fs";

import { minimatch } from "minimatch";
import { parse } from "yaml";

/**
 * high-risk の区分（risk:db・risk:webhook 等）ごとに、該当するファイルと確認観点のチェックリストを
 * PR Diff Summary のコメント（scripts/ci/pr-diff-summary.ts）に載せる節を作る（#476）。
 * 精読するときに、区分ごとに違う観点へ焦点を絞れるようにする。
 *
 * 区分の判定（ファイルのパス → 区分）は .github/labeler.yml を正とし、ここにはパスを書かない。
 * 確認観点は docs/review-checklists/<区分>.md の `- [ ]` の行。
 */

export const HIGH_RISK_LABEL = "high-risk";
const RISK_LABEL_PREFIX = "risk:";
export const LABELER_CONFIG = ".github/labeler.yml";
// コメントの文字数の上限（65,536文字）対策。区分ごとの該当ファイルの一覧はここで切る
export const MAX_LISTED_FILES_PER_RISK = 50;

export type RiskRule = { label: string; globs: string[] };
export type Checklist = { title: string; items: string[] };

// ---------------------------------------------------------------------------
// 区分の判定
// ---------------------------------------------------------------------------

/**
 * labeler.yml からラベルごとの glob を読む。
 * 書き方は `- changed-files: - any-glob-to-any-file: [...]` だけを受け付け、それ以外はエラーにする
 * （labeler とここで判定がずれたまま気づかない、ということが無いようにするため）
 */
export function parseLabelGlobs(yaml: string): Record<string, string[]> {
  const config = parse(yaml) as Record<string, unknown>;
  const result: Record<string, string[]> = {};
  for (const [label, matchers] of Object.entries(config)) {
    const globs: string[] = [];
    for (const matcher of asArray(matchers)) {
      const changedFiles = (matcher as Record<string, unknown> | null)?.[
        "changed-files"
      ];
      if (!changedFiles || Object.keys(matcher as object).length !== 1) {
        throw new Error(`${LABELER_CONFIG} の ${label}: ${unsupported}`);
      }
      for (const rule of asArray(changedFiles)) {
        const anyGlob = (rule as Record<string, unknown> | null)?.[
          "any-glob-to-any-file"
        ];
        if (!anyGlob || Object.keys(rule as object).length !== 1) {
          throw new Error(`${LABELER_CONFIG} の ${label}: ${unsupported}`);
        }
        globs.push(...asArray(anyGlob).map(String));
      }
    }
    result[label] = globs;
  }
  return result;
}

const unsupported =
  "changed-files の any-glob-to-any-file 以外の書き方は scripts/ci/review-checklists.ts で読めません";

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value];

/** risk: で始まるラベルを、labeler.yml に書いた順に返す */
export function parseRiskRules(yaml: string): RiskRule[] {
  return Object.entries(parseLabelGlobs(yaml))
    .filter(([label]) => label.startsWith(RISK_LABEL_PREFIX))
    .map(([label, globs]) => ({ label, globs }));
}

/** ファイルが当たる区分のラベル。actions/labeler と同じく minimatch を dot: true で使う */
export function riskLabelsOf(file: string, rules: RiskRule[]): string[] {
  return rules
    .filter((rule) =>
      rule.globs.some((glob) => minimatch(file, glob, { dot: true }))
    )
    .map((rule) => rule.label);
}

// ---------------------------------------------------------------------------
// 確認観点
// ---------------------------------------------------------------------------

export function checklistPath(label: string): string {
  return `docs/review-checklists/${label.slice(RISK_LABEL_PREFIX.length)}.md`;
}

/** 最初の見出しをタイトルに、`- [ ] ` で始まる行をチェック項目として読む */
export function parseChecklist(markdown: string): Checklist {
  const lines = markdown.split("\n");
  const title =
    lines
      .find((l) => /^#\s/.test(l))
      ?.replace(/^#\s+/, "")
      .trim() ?? "";
  const items = lines
    .filter((l) => l.startsWith("- [ ] "))
    .map((l) => l.slice("- [ ] ".length).trim());
  return { title, items };
}

export function loadChecklist(label: string): Checklist {
  return parseChecklist(readFileSync(checklistPath(label), "utf8"));
}

// ---------------------------------------------------------------------------
// コメントの節
// ---------------------------------------------------------------------------

/** 区分に当たるファイルが無ければ null（節を出さない） */
export function renderReviewChecklistSection(
  files: string[],
  {
    rules,
    loadChecklist,
    docUrl,
  }: {
    rules: RiskRule[];
    loadChecklist: (label: string) => Checklist;
    /** 確認観点のファイルへのリンク先。分からなければパスだけを出す */
    docUrl?: (path: string) => string;
  }
): string | null {
  const matched = rules
    .map((rule) => ({
      rule,
      files: files.filter((f) => riskLabelsOf(f, [rule]).length > 0),
    }))
    .filter((m) => m.files.length > 0);
  if (matched.length === 0) return null;

  const out = [
    "## high-risk の確認観点",
    "",
    "区分（`risk:*` ラベル）ごとに、該当するファイルと精読するときの確認観点です（CLAUDE.md「PRのレビュー」）。",
  ];
  for (const { rule, files: matchedFiles } of matched) {
    const checklist = loadChecklist(rule.label);
    const path = checklistPath(rule.label);
    out.push(
      "",
      `### ${checklist.title}（\`${rule.label}\`）`,
      "",
      `確認観点: ${docUrl ? `[${path}](${docUrl(path)})` : `\`${path}\``}`,
      "",
      "<details>",
      `<summary>該当するファイル（${matchedFiles.length}）</summary>`,
      "",
      ...matchedFiles
        .slice(0, MAX_LISTED_FILES_PER_RISK)
        .map((f) => `- \`${f}\``),
      ...(matchedFiles.length > MAX_LISTED_FILES_PER_RISK
        ? [`- ほか${matchedFiles.length - MAX_LISTED_FILES_PER_RISK}ファイル`]
        : []),
      "",
      "</details>",
      "",
      ...checklist.items.map((item) => `- [ ] ${item}`)
    );
  }
  return out.join("\n");
}
