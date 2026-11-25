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

// 識別子は stripNonCode で "x" に置き換えてある
const IDENT = String.raw`(?:"x"|\w+)`;
// ALTER TABLE の文から、表の名前までを取り除いて、操作の並び（カンマ区切り）だけにする
const ALTER_TABLE_PREFIX = new RegExp(
  String.raw`^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}(?:\s*\.\s*${IDENT})?\s*\*?`
);

const PRIVILEGE_STATEMENT =
  /^\s*(?:grant|revoke|alter\s+default\s+privileges)\b/;

const DESTRUCTIVE_PATTERNS: {
  label: string;
  /** ALTER TABLE の操作の並びに当てるか（COLUMN を省いた書き方を拾うため） */
  alterTableActions?: boolean;
  pattern: RegExp;
}[] = [
  { label: "drop table", pattern: /\bdrop\s+table\b/ },
  {
    label: "drop column",
    alterTableActions: true,
    // DROP [COLUMN] [IF EXISTS] 列。制約・既定値・NOT NULL 等の削除は列を消さない
    pattern:
      /(?:^|,)\s*drop\s+(?!constraint\b|default\b|not\b|expression\b|identity\b)/,
  },
  {
    label: "alter column ... type",
    alterTableActions: true,
    pattern: new RegExp(
      String.raw`(?:^|,)\s*alter\s+(?:column\s+)?${IDENT}\s+(?:set\s+data\s+)?type\b`
    ),
  },
  { label: "truncate", pattern: /\btruncate\b/ },
];

/**
 * コメントと文字列リテラルを空白に、二重引用符の識別子を "x" に置き換え、小文字にする（中の語を拾わないため）。
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
    } else if (sql[i] === '"') {
      // "" はエスケープした二重引用符なので、識別子の続き
      i++;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') break;
        else i++;
      }
      i++;
      out += '"x"';
    } else if (sql[i] === "'" || isEscapeStringStart(sql, i)) {
      // E'...' はバックスラッシュでも引用符をエスケープできる。'' はどちらでもエスケープした引用符
      const backslash = sql[i] !== "'";
      i += backslash ? 2 : 1;
      while (i < sql.length) {
        if (backslash && sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
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

/** i の位置が E'...' の始まりか（直前が識別子の文字なら、E で終わる名前の一部） */
function isEscapeStringStart(sql: string, i: number): boolean {
  return (
    (sql[i] === "e" || sql[i] === "E") &&
    sql[i + 1] === "'" &&
    !/\w/.test(sql[i - 1] ?? "")
  );
}

/** SQL の中のデータを消しうる文の種類を、見つけた順ではなく DESTRUCTIVE_PATTERNS の順で返す */
export function findDestructiveStatements(sql: string): string[] {
  const statements = stripNonCode(sql).split(";");
  const alterTableActions = statements
    .filter((statement) => ALTER_TABLE_PREFIX.test(statement))
    .map((statement) => statement.replace(ALTER_TABLE_PREFIX, ""));
  // GRANT・REVOKE の権限の名前（TRUNCATE）は文ではない
  const others = statements.filter(
    (statement) => !PRIVILEGE_STATEMENT.test(statement)
  );
  return DESTRUCTIVE_PATTERNS.filter(
    ({ pattern, alterTableActions: inAlter }) =>
      (inAlter ? alterTableActions : others).some((s) => pattern.test(s))
  ).map(({ label }) => label);
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
