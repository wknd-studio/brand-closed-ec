import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * PRで追加・変更したマイグレーションに、データを消しうる文（drop table・drop column・
 * alter column ... type・truncate）があれば失敗させる（#784）。
 * `supabase db schema declarative sync` は、列・テーブルの名前の変更を「消して作り直す」と解釈するため
 * （docs/declarative-schema.md）、意図しない削除をマージ前に止める。
 *
 * 意図して消すときは、そのマイグレーションに `-- destructive-ok: <理由>` のコメントを書くと通す。
 *
 * 使い方: pnpm -s tsx scripts/ci/check-destructive-migrations.ts <base-ref> [<head-ref>]
 *   例: pnpm -s tsx scripts/ci/check-destructive-migrations.ts origin/develop HEAD
 */

/** develop のブランチ保護に必須チェックとして登録する名前（migration-order.yml のジョブ名） */
export const CHECK_NAME = "Destructive Migration Check";
export const ALLOW_MARKER = "destructive-ok:";
const MIGRATIONS_DIR = "supabase/migrations";

const DESTRUCTIVE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "drop table", pattern: /\bdrop\s+table\b/ },
  { label: "drop column", pattern: /\bdrop\s+column\b/ },
  {
    label: "alter column ... type",
    pattern: /\balter\s+column\s+("[^"]+"|\w+)\s+(set\s+data\s+)?type\b/,
  },
  { label: "truncate", pattern: /\btruncate\b/ },
];

/**
 * コメントと文字列リテラルを空白に置き換え、小文字にする（中の語を拾わないため）。
 * ドル引用（関数の本体・DO ブロック）は残す。DO ブロックはマイグレーションの実行時に動くため
 */
function stripNonCode(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      out += " ";
    } else if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += " ";
    } else if (sql[i] === "'") {
      // '' はエスケープした引用符なので、文字列の続き
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      i++;
      out += " ";
    } else {
      out += sql[i];
      i++;
    }
  }
  return out.toLowerCase();
}

/** SQL の中のデータを消しうる文の種類を、見つけた順ではなく DESTRUCTIVE_PATTERNS の順で返す */
export function findDestructiveStatements(sql: string): string[] {
  const code = stripNonCode(sql);
  return DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(
    ({ label }) => label
  );
}

/** `-- destructive-ok: <理由>` の理由。無ければ null */
function allowReason(sql: string): string | null {
  const match = sql.match(
    new RegExp(`--\\s*${ALLOW_MARKER}[ \\t]*(\\S[^\\n]*)`)
  );
  return match?.[1]?.trim() ?? null;
}

export type MigrationFile = { path: string; content: string };

export function judgeDestructiveMigrations(files: MigrationFile[]): {
  ok: boolean;
  message: string;
} {
  const blocked: string[] = [];
  const allowed: string[] = [];

  for (const file of files) {
    const found = findDestructiveStatements(file.content);
    if (found.length === 0) continue;
    const reason = allowReason(file.content);
    if (reason) {
      allowed.push(`  - ${file.path}（${found.join("・")}）: ${reason}`);
    } else {
      blocked.push(`  - ${file.path}（${found.join("・")}）`);
    }
  }

  const lines: string[] = [];
  if (allowed.length > 0) {
    lines.push(
      `::warning::理由を書いて通した、データを消しうるマイグレーションがあります（レビューで確かめてください）`,
      ...allowed
    );
  }
  if (blocked.length > 0) {
    lines.push(
      `::error::データを消しうる文（drop table・drop column・alter column ... type・truncate）を含むマイグレーションがあります`,
      ...blocked,
      "",
      "`supabase db schema declarative sync` は、列・テーブルの名前の変更を「消して作り直す」マイグレーションにします。",
      "名前の変更なら、そのマイグレーションを消し、`supabase migration new` で `ALTER TABLE ... RENAME` を手で書いてください（docs/declarative-schema.md）。",
      `意図して消すなら、マイグレーションに \`-- ${ALLOW_MARKER} <理由>\` のコメントを書いてください。`
    );
  }
  if (lines.length === 0) {
    lines.push("OK: データを消しうる文を含むマイグレーションはありません");
  }
  return { ok: blocked.length === 0, message: lines.join("\n") };
}

function main() {
  const baseRef = process.argv[2];
  const headRef = process.argv[3] ?? "HEAD";
  if (!baseRef) {
    console.error("ベースのref（例: origin/develop）を指定してください");
    process.exit(2);
  }

  const paths = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=AMR",
      `${baseRef}...${headRef}`,
      "--",
      `${MIGRATIONS_DIR}/*.sql`,
    ],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean);

  const files = paths.map((p) => ({
    path: p,
    content: execFileSync("git", ["show", `${headRef}:${p}`], {
      encoding: "utf8",
    }),
  }));

  const { ok, message } = judgeDestructiveMigrations(files);
  console.log(message);
  if (!ok) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
