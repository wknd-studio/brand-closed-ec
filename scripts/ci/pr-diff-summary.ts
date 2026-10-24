import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * PRの差分を区分（層）ごとに集計し、PRコメントの本文を作る（#472）。
 * レビューする人間が、差分のどこが本番コードで、どこがテスト・生成物なのかを一目で分かるようにし、
 * CLAUDE.md「PRの粒度」の目安（本番コードの行数・ファイル数）と比べられるようにする。
 *
 * コメントは REPORT_MARKER で始まり、`## 見出し` の節を並べた形にする。
 * 他の検査（例: #476 の high-risk の確認観点）は、renderComment に節を足して同じコメントに載せる。
 *
 * 使い方: pnpm -s tsx scripts/ci/pr-diff-summary.ts <base-ref> <head-ref> [--report <file>]
 *   例: pnpm -s tsx scripts/ci/pr-diff-summary.ts origin/develop HEAD
 *   base...head（merge-base からの差分）を数える。生成物の判定は作業ツリーの .gitattributes を使う
 */

const REPORT_MARKER = "<!-- pr-diff-summary -->";
// GitHubのコメントは65,536文字まで。一括置換等で数百ファイル変えても超えないよう、ファイルごとの表は上限で切る
export const MAX_LISTED_FILES = 200;

/** CLAUDE.md「PRの粒度」の、分割を検討する目安。値を変えるときは CLAUDE.md とテンプレートも直す */
export const GUIDELINE = {
  productionLines: 200,
  productionFiles: 5,
} as const;

export const CATEGORIES = [
  { key: "domain", label: "domain", production: true },
  { key: "use-cases", label: "use-cases", production: true },
  {
    key: "interface",
    label: "repositories / queries（interface）",
    production: true,
  },
  { key: "infrastructure", label: "infrastructure", production: true },
  { key: "app", label: "app", production: true },
  { key: "components", label: "components / UI", production: true },
  { key: "sql", label: "SQL（マイグレーション）", production: true },
  { key: "test", label: "テスト", production: false },
  { key: "generated", label: "生成物", production: false },
  { key: "docs", label: "ドキュメント", production: false },
  { key: "config", label: "CI / 設定", production: false },
  { key: "other", label: "その他", production: false },
] as const;

export type Category = (typeof CATEGORIES)[number]["key"];

// ---------------------------------------------------------------------------
// 区分の判定
// ---------------------------------------------------------------------------

// 上から順に判定し、最初に当たった区分にする
const RULES: { category: Category; test: (file: string) => boolean }[] = [
  {
    category: "test",
    test: (f) =>
      f.startsWith("tests/") ||
      f.startsWith("supabase/tests/") ||
      /(^|\/)__tests__\//.test(f) ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(f),
  },
  {
    category: "sql",
    test: (f) => f.startsWith("supabase/migrations/") && f.endsWith(".sql"),
  },
  {
    // 開発・CI用のツール。src/lib/issue-deps-graph は依存グラフのページを作るツールでアプリからは使わない
    category: "config",
    test: (f) =>
      /^\.(github|claude|specify|husky|storybook)\//.test(f) ||
      f.startsWith("scripts/") ||
      f.startsWith("supabase/") ||
      f.startsWith("src/lib/issue-deps-graph/"),
  },
  {
    category: "docs",
    test: (f) =>
      f.startsWith("docs/") || f.startsWith("specs/") || /\.mdx?$/.test(f),
  },
  { category: "domain", test: (f) => f.startsWith("src/domain/") },
  { category: "use-cases", test: (f) => f.startsWith("src/use-cases/") },
  {
    category: "interface",
    test: (f) =>
      f.startsWith("src/repositories/") || f.startsWith("src/queries/"),
  },
  {
    category: "infrastructure",
    test: (f) => f.startsWith("src/infrastructure/"),
  },
  { category: "components", test: (f) => f.startsWith("src/components/") },
  // src/app のほか、src/composition（#437）・src/lib・middleware 等、アプリとして動くもの
  { category: "app", test: (f) => f.startsWith("src/") },
  // ルート直下のファイル（package.json・next.config.ts 等）
  { category: "config", test: (f) => !f.includes("/") },
];

/**
 * パスの区分を返す。generated は .gitattributes の linguist-generated（GitHubの差分表示で折りたたむ生成物）。
 * 生成物の一覧は .gitattributes を正とし、ここには書かない
 */
export function classifyPath(
  file: string,
  { generated }: { generated: boolean }
): Category {
  if (generated) return "generated";
  return RULES.find((rule) => rule.test(file))?.category ?? "other";
}

// ---------------------------------------------------------------------------
// 差分の読み取りと集計
// ---------------------------------------------------------------------------

export type NumstatEntry = { path: string; added: number; deleted: number };
export type DiffEntry = NumstatEntry & { category: Category };
export type Totals = { files: number; added: number; deleted: number };

/** `git diff --numstat -z` の出力を読む。バイナリは0行、リネームは移動先のパスで数える */
export function parseNumstat(output: string): NumstatEntry[] {
  const fields = output.split("\0");
  const entries: NumstatEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(fields[i]);
    if (!match) continue;
    let file = match[3];
    if (file === "") {
      // リネーム・コピー: 続く2つのフィールドが移動元・移動先
      file = fields[i + 2];
      i += 2;
    }
    entries.push({
      path: file,
      added: match[1] === "-" ? 0 : Number(match[1]),
      deleted: match[2] === "-" ? 0 : Number(match[2]),
    });
  }
  return entries;
}

export type DiffSummary = {
  entries: DiffEntry[];
  byCategory: Record<Category, Totals>;
  production: Totals;
  total: Totals;
};

function add(totals: Totals, entry: NumstatEntry) {
  totals.files += 1;
  totals.added += entry.added;
  totals.deleted += entry.deleted;
}

const empty = (): Totals => ({ files: 0, added: 0, deleted: 0 });

export function summarizeDiff(entries: DiffEntry[]): DiffSummary {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, empty()])
  ) as Record<Category, Totals>;
  const production = empty();
  const total = empty();
  for (const entry of entries) {
    add(byCategory[entry.category], entry);
    add(total, entry);
    if (CATEGORIES.find((c) => c.key === entry.category)?.production) {
      add(production, entry);
    }
  }
  return { entries, byCategory, production, total };
}

// ---------------------------------------------------------------------------
// コメント本文
// ---------------------------------------------------------------------------

const lines = (t: Totals) => t.added + t.deleted;

function formatTotals(t: Totals) {
  return `${lines(t)}行（+${t.added} / −${t.deleted}）・${t.files}ファイル`;
}

export function renderDiffSummarySection(summary: DiffSummary): string {
  const { production, total, byCategory, entries } = summary;
  const exceeded =
    lines(production) > GUIDELINE.productionLines ||
    production.files > GUIDELINE.productionFiles;
  const out = [
    "## 差分の内訳",
    "",
    `**本番コード: ${formatTotals(production)}**`,
    `（目安: 本番コード${GUIDELINE.productionLines}行・${GUIDELINE.productionFiles}ファイル。本番コード = domain〜components と SQL）`,
    "",
  ];
  if (exceeded) {
    out.push(
      "> [!NOTE]",
      "> 本番コードが分割を検討する目安を超えています。目的が複数混ざっていないかを見直し、1目的のまま超える場合はその理由をPR本文に書いてください（CLAUDE.md「PRの粒度」）。",
      ""
    );
  }
  out.push("| 区分 | ファイル | 追加 | 削除 |", "| --- | ---: | ---: | ---: |");
  for (const c of CATEGORIES) {
    const t = byCategory[c.key];
    if (t.files === 0) continue;
    out.push(`| ${c.label} | ${t.files} | +${t.added} | −${t.deleted} |`);
  }
  out.push(
    `| **合計** | **${total.files}** | **+${total.added}** | **−${total.deleted}** |`,
    "",
    "<details>",
    "<summary>ファイルごとの区分</summary>",
    "",
    "| 区分 | ファイル | 追加 | 削除 |",
    "| --- | --- | ---: | ---: |"
  );
  const listed = CATEGORIES.flatMap((c) =>
    entries.filter((e) => e.category === c.key).map((e) => ({ c, e }))
  );
  for (const { c, e } of listed.slice(0, MAX_LISTED_FILES)) {
    out.push(`| ${c.label} | \`${e.path}\` | +${e.added} | −${e.deleted} |`);
  }
  if (listed.length > MAX_LISTED_FILES) {
    out.push(
      "",
      `ほか${listed.length - MAX_LISTED_FILES}ファイル（コメントの文字数の上限のため省略）`
    );
  }
  out.push("", "</details>");
  return out.join("\n");
}

/** PRコメントの本文。マーカーでコメントを見つけて更新する（push のたびにコメントを増やさない） */
export function renderComment(sections: string[]): string {
  return [REPORT_MARKER, ...sections].join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// git からの読み取り
// ---------------------------------------------------------------------------

function git(args: string[], input?: string) {
  return execFileSync("git", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function linguistGenerated(files: string[]): Set<string> {
  if (files.length === 0) return new Set();
  // 出力は <path>\0<attr>\0<value>\0 の繰り返し
  const fields = git(
    ["check-attr", "-z", "--stdin", "linguist-generated"],
    files.join("\0") + "\0"
  ).split("\0");
  const generated = new Set<string>();
  for (let i = 0; i + 2 < fields.length; i += 3) {
    if (fields[i + 2] === "true" || fields[i + 2] === "set") {
      generated.add(fields[i]);
    }
  }
  return generated;
}

export function readDiff(base: string, head: string): DiffEntry[] {
  const numstat = parseNumstat(
    git(["diff", "--numstat", "-z", "-M", `${base}...${head}`])
  );
  const generated = linguistGenerated(numstat.map((e) => e.path));
  return numstat.map((e) => ({
    ...e,
    category: classifyPath(e.path, { generated: generated.has(e.path) }),
  }));
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
      "使い方: pnpm -s tsx scripts/ci/pr-diff-summary.ts <base-ref> <head-ref> [--report <file>]"
    );
    process.exit(2);
  }

  const comment = renderComment([
    renderDiffSummarySection(summarizeDiff(readDiff(base, head))),
  ]);
  if (reportPath) writeFileSync(reportPath, comment);
  console.log(comment);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
