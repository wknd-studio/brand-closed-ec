import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/**
 * src/lib のうち、docs/ai-prompts/architecture.md で lib に置かないと決めたもの
 * （外部サービスのクライアント生成・メール・Server Action・Studio用ツール）を各層へ移し、
 * それを参照している import・vi.mock 等のパスを書き換える（#448）。
 *
 * 使い方: pnpm tsx scripts/codemods/move-lib-to-layers.ts（リポジトリのルートで実行）
 *
 * 書き換えるのは、"@/..." か "./..."・"../..." の文字列リテラルのうち、移動するファイルを指すものと、
 * 移動するファイルの中の相対パスだけ。"@/..." は "@/..." のまま、相対パスは移動後も "./" で
 * 書けるときだけ相対のままにし、それ以外は "@/..." にする。
 */

// 移動元 → 移動先（ディレクトリは末尾に / を付け、配下を丸ごと移す）
const MOVES: [from: string, to: string][] = [
  ["src/lib/supabase/server.ts", "src/infrastructure/supabase/server.ts"],
  [
    "src/lib/supabase/server-admin.ts",
    "src/infrastructure/supabase/server-admin.ts",
  ],
  ["src/lib/sanity/client.ts", "src/infrastructure/sanity/client.ts"],
  ["src/lib/stripe.ts", "src/infrastructure/stripe/client.ts"],
  ["src/lib/email/index.ts", "src/infrastructure/resend/client.ts"],
  ["src/lib/email/templates/", "src/emails/"],
  // テンプレートを描画して Resend で送る関数（NotificationService の実装から使う）
  ...[
    "checkout-paid",
    "delivery-notification",
    "invoice-paid",
    "limit-exceeded",
    "order-confirming",
    "order-operator-notification",
    "shipping-notification",
  ].map((name): [string, string] => [
    `src/lib/email/${name}.ts`,
    `src/infrastructure/resend/${name}.ts`,
  ]),
  ["src/lib/favorites/actions.ts", "src/app/(member)/favorites/actions.ts"],
  ["src/lib/product-import/", "src/sanity/tools/product-import/"],
];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

const tracked = new Set(
  execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
);

// 移動元のファイル → 移動先のファイル
const moved = new Map<string, string>();
for (const [from, to] of MOVES) {
  if (!from.endsWith("/")) {
    moved.set(from, to);
    continue;
  }
  for (const file of tracked) {
    if (file.startsWith(from)) moved.set(file, to + file.slice(from.length));
  }
}
for (const [from, to] of moved) {
  if (!tracked.has(from)) throw new Error(`移動元がありません: ${from}`);
  if (existsSync(to)) throw new Error(`移動先が既にあります: ${to}`);
}

const newPathOf = (file: string) => moved.get(file) ?? file;

function resolveSpecifier(importer: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.posix.join("src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    base = path.posix.join(path.posix.dirname(importer), spec);
  else return null;
  for (const suffix of RESOLVE_SUFFIXES) {
    if (tracked.has(base + suffix)) return base + suffix;
  }
  return null;
}

function specifierFor(importer: string, target: string, spec: string): string {
  const withoutExt = target.replace(/\.(ts|tsx)$/, "");
  const alias = `@/${withoutExt.replace(/^src\//, "")}`;
  if (spec.startsWith("@/")) return alias;
  const relative = path.posix.relative(
    path.posix.dirname(importer),
    withoutExt
  );
  return relative.startsWith("..") ? alias : `./${relative}`;
}

const STRING_LITERAL = /(["'])((?:@|\.\.?)\/[^"'\n]*)\1/g;

let rewritten = 0;
for (const file of tracked) {
  if (!SOURCE_EXTENSIONS.includes(path.posix.extname(file))) continue;
  if (file.startsWith("scripts/codemods/")) continue;
  const source = readFileSync(file, "utf8");
  const importerMoved = moved.has(file);
  const next = source.replace(STRING_LITERAL, (literal, quote, spec) => {
    const target = resolveSpecifier(file, spec);
    if (target === null) return literal;
    if (!importerMoved && !moved.has(target)) return literal;
    return `${quote}${specifierFor(newPathOf(file), newPathOf(target), spec)}${quote}`;
  });
  if (next !== source) {
    writeFileSync(file, next);
    rewritten++;
  }
}

for (const [from, to] of moved) {
  mkdirSync(path.posix.dirname(to), { recursive: true });
  renameSync(from, to);
}

console.log(
  `移動: ${moved.size} ファイル / パスの書き換え: ${rewritten} ファイル`
);
