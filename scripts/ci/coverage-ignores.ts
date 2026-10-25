import { execFileSync } from "node:child_process";

/**
 * PRで追加された、カバレッジの検査から行を外すコメント（v8 ignore 等）を、PR Diff Summary の
 * コメントに一覧で出す（#455）。層ごとのカバレッジ検査（scripts/ci/layer-coverage.ts）は、
 * 本当に到達できない行だけをこのコメントで外してよいことにしている。黙って外されないよう、
 * 追加された箇所と理由を人間の目に入るようにする。
 */

const IGNORE_PATTERN = /\b(?:v8|c8|istanbul)\s+ignore\b/;
// GitHubのコメントの文字数の上限対策
const MAX_LISTED_IGNORES = 50;

export type AddedIgnore = { file: string; line: number; text: string };

/** `git diff -U0` の出力から、src/ 配下で追加された除外コメントを読む */
export function parseAddedCoverageIgnores(diff: string): AddedIgnore[] {
  const ignores: AddedIgnore[] = [];
  let file: string | null = null;
  let line = 0;
  for (const row of diff.split("\n")) {
    if (row.startsWith("+++ ")) {
      const target = row.slice(4);
      file = target.startsWith("b/src/") ? target.slice(2) : null;
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)/.exec(row);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || !row.startsWith("+")) continue;
    if (IGNORE_PATTERN.test(row)) {
      ignores.push({ file, line, text: row.slice(1).trim() });
    }
    line++;
  }
  return ignores;
}

/** 追加が無ければ null（節を出さない） */
export function renderCoverageIgnoreSection(
  ignores: AddedIgnore[]
): string | null {
  if (ignores.length === 0) return null;
  return [
    "## カバレッジの検査から外した箇所",
    "",
    "このPRで追加された、カバレッジの検査から行を外すコメントです。層に合ったテストでは本当に到達できない行か（テストを足せば実行できる行や、削除すべき未使用のコードを外していないか）を確認してください（CLAUDE.md「変更した層ごとの確認ルール」）。",
    "",
    ...ignores.slice(0, MAX_LISTED_IGNORES).map((i) => {
      // esbuild がコメントを消すため、@preserve が無いと除外は効かない
      const note = i.text.includes("@preserve")
        ? ""
        : "（@preserve が無いため効いていない）";
      return `- \`${i.file}:${i.line}\` ${i.text}${note}`;
    }),
    ...(ignores.length > MAX_LISTED_IGNORES
      ? [`- ほか${ignores.length - MAX_LISTED_IGNORES}件`]
      : []),
  ].join("\n");
}

export function readAddedCoverageIgnores(
  base: string,
  head: string
): AddedIgnore[] {
  return parseAddedCoverageIgnores(
    execFileSync(
      "git",
      ["diff", "-U0", "--no-color", "-M", `${base}...${head}`, "--", "src/"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  );
}
