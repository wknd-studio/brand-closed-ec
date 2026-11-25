import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { minimatch } from "minimatch";
import ts from "typescript";
import { parse } from "yaml";

import {
  LABELER_CONFIG,
  parseRiskRules,
  riskLabelsOf,
  type RiskRule,
} from "./review-checklists";

/**
 * PRに high-risk（人間が差分を精読してからマージする）を付けるかを判定する（#578）。
 * 付けるのは次のどれかに当たるPRだけにする。それ以外は CI と PR 本文の証拠欄で判断する。
 *
 *   1. 精読が必須の区分（HIGH_RISK_CATEGORIES）の対象パスに触れる
 *   2. ゲートを弱める変更（必須チェックのジョブの削除・if: の追加、カバレッジの閾値の引き下げ・例外の追加、
 *      lint の抑制の追加、Claude Code の権限の追加）
 *   3. ゲートの本体（ALWAYS_HIGH_RISK_GLOBS。Test Guard・high-risk の判定・gitleaks）の変更
 *   4. 依存の追加・メジャーバージョンの変更（lockfile だけ・パッチ/マイナーの更新は対象外）
 *
 * risk:gate・risk:deps の区分のラベル自体は .github/labeler.yml が今までどおり付ける
 * （PR Diff Summary に区分ごとのチェックリストを出すため）。high-risk は labeler.yml に書かず、
 * Labeler ワークフローの high-risk ジョブがこのスクリプトの結果で付け外しする。
 *
 * 検出は完全ではない（例: `run:` に `|| true` を足す、lint のルールを無効にする）。すり抜けた弱め方は、
 * ここに検出を足すか docs/review-checklists/ の観点に足す（CLAUDE.md「PRのレビュー」）。
 *
 * PRの変更はデータとして読むだけで実行しない（pull_request_target で書き込み権限のあるジョブで動くため）。
 *
 * 使い方: pnpm -s tsx scripts/ci/high-risk.ts <base-ref> <head-ref>
 *   例: pnpm -s tsx scripts/ci/high-risk.ts origin/develop HEAD
 *   base...head（merge-base からの差分）を見る。GITHUB_OUTPUT があれば `high-risk=true|false` を書く
 */

export const HIGH_RISK_CATEGORIES = [
  "risk:db",
  "risk:webhook",
  "risk:auth",
  "risk:payment",
] as const;

/** 弱めたかを機械的に見分けられないため、どう変えても high-risk にするゲートの本体 */
const ALWAYS_HIGH_RISK_GLOBS = [
  // Test Guard の対象（テストの判定・ワークフロー）
  ".github/workflows/test-guard.yml",
  "scripts/ci/check-test-tampering.sh",
  // high-risk の判定そのもの
  LABELER_CONFIG,
  ".github/workflows/labeler.yml",
  "scripts/ci/high-risk.ts",
  "scripts/ci/review-checklists.ts",
  // 機密情報の漏れの検査（#663。docs/cicd.md）。allowlist を広げる・hook を外すとゲートを弱められる
  ".gitleaks.toml",
  ".husky/**",
  "scripts/gitleaks-staged.sh",
  // issue の範囲外の high-risk の変更を止める判定（#795。docs/cicd.md「Issue Scope」）
  "scripts/ci/issue-scope.ts",
  ".github/workflows/issue-scope.yml",
  ".claude/hooks/**",
];

export type FileChange = {
  path: string;
  /** merge-base での中身。新しく作ったファイルなら null */
  base: string | null;
  /** head での中身。削除したファイルなら null */
  head: string | null;
};
export type Finding = { file: string; reason: string };
type Detector = (base: string | null, head: string | null) => Reason[];
type Reason = { reason: string };

const UNREADABLE_JSON =
  "JSON として読めない（ゲートを弱めたかを機械的に判定できない）";
const UNREADABLE_YAML =
  "YAML として読めない（ゲートを弱めたかを機械的に判定できない）";
const UNREADABLE_LAYER_COVERAGE =
  "LAYER_COVERAGE を機械的に読めない（ゲートを弱めたかを判定できない）";

const DETECTORS: { glob: string; detect: Detector }[] = [
  { glob: ".github/workflows/*.{yml,yaml}", detect: detectWorkflowWeakening },
  {
    glob: "scripts/ci/layer-coverage.config.ts",
    detect: detectLayerCoverageWeakening,
  },
  {
    glob: "eslint-suppressions.json",
    detect: detectEslintSuppressionsWeakening,
  },
  { glob: ".claude/settings.json", detect: detectClaudeSettingsWeakening },
  { glob: "package.json", detect: detectDependencyChanges },
];

const matches = (file: string, glob: string) =>
  minimatch(file, glob, { dot: true });

/** 精読が必須の区分の対象パス */
export function highRiskGlobs(rules: RiskRule[]): string[] {
  return rules
    .filter((r) =>
      (HIGH_RISK_CATEGORIES as readonly string[]).includes(r.label)
    )
    .flatMap((r) => r.globs);
}

export function judgeHighRisk(
  changes: FileChange[],
  rules: RiskRule[]
): { highRisk: boolean; reasons: Finding[] } {
  const categories = rules.filter((r) =>
    (HIGH_RISK_CATEGORIES as readonly string[]).includes(r.label)
  );
  const reasons: Finding[] = [];
  for (const change of changes) {
    const file = change.path;
    for (const label of riskLabelsOf(file, categories)) {
      reasons.push({ file, reason: `精読が必須の区分（${label}）` });
    }
    if (ALWAYS_HIGH_RISK_GLOBS.some((glob) => matches(file, glob))) {
      reasons.push({ file, reason: "ゲートの本体の変更" });
    }
    for (const { glob, detect } of DETECTORS) {
      if (!matches(file, glob)) continue;
      for (const { reason } of detect(change.base, change.head)) {
        reasons.push({ file, reason });
      }
    }
  }
  return { highRisk: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// ワークフロー: 必須チェックのジョブの削除・if: の追加・continue-on-error の追加
// ---------------------------------------------------------------------------

type Job = {
  if?: unknown;
  "continue-on-error"?: unknown;
  steps?: { if?: unknown; "continue-on-error"?: unknown }[];
};

/**
 * どのジョブが必須チェックかはリポジトリの外（ブランチ保護）にあるため、既存のジョブはすべて
 * 必須チェックとみなす。新しく足したジョブはまだ必須チェックではないため見ない
 */
export function detectWorkflowWeakening(
  base: string | null,
  head: string | null
): Reason[] {
  const baseJobs = workflowJobs(base);
  if (baseJobs === "unreadable") return [];
  const headJobs = workflowJobs(head);
  if (headJobs === "unreadable") return [{ reason: UNREADABLE_YAML }];

  const reasons: Reason[] = [];
  for (const [name, before] of Object.entries(baseJobs)) {
    const after = headJobs[name];
    if (!after) {
      reasons.push({ reason: `ジョブ ${name} の削除` });
      continue;
    }
    if (after.if !== undefined && after.if !== before.if) {
      reasons.push({
        reason: `ジョブ ${name} への if: の追加・変更（${String(after.if)}）`,
      });
    }
    if (isContinueOnError(after) && !isContinueOnError(before)) {
      reasons.push({ reason: `ジョブ ${name} への continue-on-error の追加` });
    }

    const stepIfs = (before.steps ?? []).map((s) => s.if);
    for (const step of after.steps ?? []) {
      if (step.if === undefined) continue;
      const index = stepIfs.indexOf(step.if);
      if (index === -1) {
        reasons.push({
          reason: `ジョブ ${name} のステップへの if: の追加・変更（${String(step.if)}）`,
        });
      } else {
        stepIfs.splice(index, 1);
      }
    }
    const before_ = (before.steps ?? []).filter(isContinueOnError).length;
    const after_ = (after.steps ?? []).filter(isContinueOnError).length;
    if (after_ > before_) {
      reasons.push({
        reason: `ジョブ ${name} のステップへの continue-on-error の追加`,
      });
    }
  }
  return reasons;
}

const isContinueOnError = (x: { "continue-on-error"?: unknown }) =>
  x["continue-on-error"] !== undefined && x["continue-on-error"] !== false;

function workflowJobs(
  content: string | null
): Record<string, Job> | "unreadable" {
  if (content === null) return {};
  try {
    const workflow = parse(content) as { jobs?: unknown } | null;
    const jobs = workflow?.jobs ?? {};
    if (typeof jobs !== "object" || Array.isArray(jobs)) return "unreadable";
    return jobs as Record<string, Job>;
  } catch {
    return "unreadable";
  }
}

// ---------------------------------------------------------------------------
// 層ごとのカバレッジ検査: 閾値の引き下げ・例外の追加
// ---------------------------------------------------------------------------

type CoverageLayer = {
  name: string;
  include: string[];
  min: Record<string, number>;
};
type CoverageConfig = {
  layers: CoverageLayer[];
  exceptions: { file: string; suite: string; issue: number }[];
};

/** 設定は TypeScript のため、実行せずに構文木から値を読む（PRのコードを実行しないため） */
export function detectLayerCoverageWeakening(
  base: string | null,
  head: string | null
): Reason[] {
  const before = readLayerCoverage(base);
  const after = readLayerCoverage(head);
  if (!after) return [{ reason: UNREADABLE_LAYER_COVERAGE }];
  if (!before) return [];

  const reasons: Reason[] = [];
  for (const layer of before.layers) {
    const next = after.layers.find((l) => l.name === layer.name);
    if (!next) {
      reasons.push({ reason: `層 ${layer.name} の削除` });
      continue;
    }
    for (const [metric, value] of Object.entries(layer.min)) {
      const nextValue = next.min[metric];
      if (nextValue === undefined || nextValue < value) {
        reasons.push({
          reason: `層 ${layer.name} の ${metric} の閾値の引き下げ（${value} → ${nextValue ?? "なし"}）`,
        });
      }
    }
    const removed = layer.include.filter((g) => !next.include.includes(g));
    if (removed.length > 0) {
      reasons.push({
        reason: `層 ${layer.name} の対象からの除外（${removed.join("・")}）`,
      });
    }
  }
  for (const e of after.exceptions) {
    const existed = before.exceptions.some(
      (b) => b.file === e.file && b.suite === e.suite
    );
    if (!existed) {
      reasons.push({
        reason: `例外の追加（${e.file}・${e.suite}・#${e.issue}）`,
      });
    }
  }
  return reasons;
}

function readLayerCoverage(content: string | null): CoverageConfig | null {
  if (content === null) return null;
  const source = ts.createSourceFile(
    "config.ts",
    content,
    ts.ScriptTarget.Latest
  );
  let initializer: ts.Expression | undefined;
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === "LAYER_COVERAGE") {
        initializer = decl.initializer;
      }
    }
  });
  if (!initializer) return null;
  try {
    const value = literalValue(initializer) as CoverageConfig;
    if (!Array.isArray(value.layers) || !Array.isArray(value.exceptions)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** 文字列・数値・真偽値・配列・オブジェクトのリテラルだけを値にする。それ以外は例外 */
function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literalValue);
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (
        !ts.isPropertyAssignment(prop) ||
        !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
      ) {
        throw new Error("unsupported property");
      }
      result[prop.name.text] = literalValue(prop.initializer);
    }
    return result;
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return literalValue(node.expression);
  }
  throw new Error(`unsupported node: ${ts.SyntaxKind[node.kind]}`);
}

// ---------------------------------------------------------------------------
// lint の抑制（#440）: 抑制の追加
// ---------------------------------------------------------------------------

type Suppressions = Record<string, Record<string, { count: number }>>;

export function detectEslintSuppressionsWeakening(
  base: string | null,
  head: string | null
): Reason[] {
  const before = readJson<Suppressions>(base) ?? {};
  if (head === null) return [];
  const after = readJson<Suppressions>(head);
  if (after === undefined) return [{ reason: UNREADABLE_JSON }];

  const reasons: Reason[] = [];
  for (const [file, rulesOfFile] of Object.entries(after ?? {})) {
    for (const [rule, { count }] of Object.entries(rulesOfFile)) {
      const previous = before[file]?.[rule]?.count ?? 0;
      if (count > previous) {
        reasons.push({
          reason: `${file} の ${rule} の抑制の追加（${previous} → ${count}）`,
        });
      }
    }
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Claude Code の権限: 許可の追加・確認と禁止の削除・hook の削除
// ---------------------------------------------------------------------------

type ClaudeSettings = {
  permissions?: {
    allow?: string[];
    ask?: string[];
    deny?: string[];
    defaultMode?: string;
  };
  hooks?: Record<
    string,
    { matcher?: string; hooks?: { command?: string }[] }[]
  >;
};

export function detectClaudeSettingsWeakening(
  base: string | null,
  head: string | null
): Reason[] {
  const before = readJson<ClaudeSettings>(base)?.permissions ?? {};
  const parsed = head === null ? {} : readJson<ClaudeSettings>(head);
  if (parsed === undefined) return [{ reason: UNREADABLE_JSON }];
  const after = parsed?.permissions ?? {};

  const reasons: Reason[] = [];
  for (const entry of after.allow ?? []) {
    if (!(before.allow ?? []).includes(entry)) {
      reasons.push({ reason: `permissions.allow への追加（${entry}）` });
    }
  }
  for (const key of ["ask", "deny"] as const) {
    for (const entry of before[key] ?? []) {
      if (!(after[key] ?? []).includes(entry)) {
        reasons.push({ reason: `permissions.${key} からの削除（${entry}）` });
      }
    }
  }
  if (after.defaultMode !== before.defaultMode) {
    reasons.push({
      reason: `permissions.defaultMode の変更（${before.defaultMode ?? "なし"} → ${after.defaultMode ?? "なし"}）`,
    });
  }
  // hook を外す・matcher を変えると、Issue Scope の hook（#795）等を無効にできる
  const afterHooks = new Set(hookEntries(parsed));
  for (const entry of hookEntries(readJson<ClaudeSettings>(base))) {
    if (!afterHooks.has(entry)) {
      reasons.push({ reason: `hooks からの削除（${entry}）` });
    }
  }
  return reasons;
}

/** `<イベント>・<matcher>: <コマンド>` の一覧 */
function hookEntries(settings: ClaudeSettings | null | undefined): string[] {
  return Object.entries(settings?.hooks ?? {}).flatMap(([event, groups]) =>
    (Array.isArray(groups) ? groups : []).flatMap((group) =>
      (group.hooks ?? []).map(
        (hook) => `${event}・${group.matcher ?? ""}: ${hook.command ?? ""}`
      )
    )
  );
}

// ---------------------------------------------------------------------------
// 依存: 追加・メジャーバージョンの変更
// ---------------------------------------------------------------------------

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "pnpm.overrides",
] as const;

type PackageJson = Record<string, unknown> & {
  pnpm?: { overrides?: Record<string, string> };
};

export function detectDependencyChanges(
  base: string | null,
  head: string | null
): Reason[] {
  const before = readJson<PackageJson>(base) ?? {};
  if (head === null) return [];
  const after = readJson<PackageJson>(head);
  if (after === undefined) return [{ reason: UNREADABLE_JSON }];

  const reasons: Reason[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const previous = dependenciesOf(before, section);
    for (const [name, spec] of Object.entries(
      dependenciesOf(after ?? {}, section)
    )) {
      const old = previous[name];
      if (old === undefined) {
        reasons.push({ reason: `依存の追加: ${name} ${spec}（${section}）` });
      } else if (old !== spec && majorOf(old) !== majorOf(spec)) {
        reasons.push({
          reason: `メジャーバージョンの変更: ${name} ${old} → ${spec}（${section}）`,
        });
      }
    }
  }
  return reasons;
}

function dependenciesOf(
  pkg: PackageJson,
  section: (typeof DEPENDENCY_SECTIONS)[number]
): Record<string, string> {
  const value =
    section === "pnpm.overrides" ? pkg.pnpm?.overrides : pkg[section];
  return (value ?? {}) as Record<string, string>;
}

/**
 * バージョンの指定から、互換性の切れ目（メジャー。0.x はマイナー）を取り出す。
 * 比べられない書き方（git・URL・タグ等）は指定そのものを返し、変えれば必ず別物にする
 */
function majorOf(spec: string): string {
  const m = /^\s*(?:[\^~]|[<>]=?|=)?\s*v?(\d+)(?:\.(\d+|x|\*))?/.exec(spec);
  if (!m) return spec;
  return m[1] === "0" ? `0.${m[2] ?? ""}` : m[1];
}

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

/** null（ファイルが無い）は null、読めなければ undefined */
function readJson<T>(content: string | null): T | null | undefined {
  if (content === null) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

function git(args: string[]) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // 片方の ref に無いファイル（新規・削除）の git show のエラーを出さない
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function show(ref: string, file: string): string | null {
  try {
    return git(["show", `${ref}:${file}`]);
  } catch {
    return null;
  }
}

export function readChanges(base: string, head: string): FileChange[] {
  const mergeBase = git(["merge-base", base, head]).trim();
  return git(["diff", "--no-renames", "--name-only", "-z", mergeBase, head])
    .split("\0")
    .filter(Boolean)
    .map((file) => ({
      path: file,
      base: show(mergeBase, file),
      head: show(head, file),
    }));
}

function main() {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error(
      "使い方: pnpm -s tsx scripts/ci/high-risk.ts <base-ref> <head-ref>"
    );
    process.exit(2);
  }
  const rules = parseRiskRules(readFileSync(LABELER_CONFIG, "utf8"));
  const { highRisk, reasons } = judgeHighRisk(readChanges(base, head), rules);

  const report = highRisk
    ? [
        "high-risk: 付ける（人間が差分を精読してからマージする）",
        ...reasons.map((r) => `- \`${r.file}\`: ${r.reason}`),
      ]
    : ["high-risk: 付けない（CI と PR 本文の証拠欄で判断する）"];
  console.log(report.join("\n"));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `high-risk=${highRisk}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report.join("\n")}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
