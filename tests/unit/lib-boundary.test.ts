import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const LIB = path.join(ROOT, "src/lib");

// docs/ai-prompts/architecture.md「src/lib に置くもの・置かないもの」（#448）。
// 外部サービスのクライアント生成は src/infrastructure/、メールテンプレートは src/emails/ に置く
const EXTERNAL_SERVICE_SDKS = [
  "@supabase/supabase-js",
  "stripe",
  "resend",
  "next-sanity",
  "@sanity/client",
  "@react-email/components",
];

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const libFiles = listSourceFiles(LIB).map((file) => ({
  file: path.relative(ROOT, file),
  source: readFileSync(file, "utf8"),
}));

describe("src/lib には業務を知らない共通部品だけを置く", () => {
  it.each(EXTERNAL_SERVICE_SDKS)(
    "外部サービスの SDK（%s）を import しない",
    (sdk) => {
      const importing = libFiles
        .filter(({ source }) =>
          new RegExp(`from\\s+["']${sdk}["']`).test(source)
        )
        .map(({ file }) => file);
      expect(importing).toEqual([]);
    }
  );

  it('Server Action（"use server"）を置かない', () => {
    const serverActions = libFiles
      .filter(({ source }) => /^\s*["']use server["']/m.test(source))
      .map(({ file }) => file);
    expect(serverActions).toEqual([]);
  });

  it("Sanity Studio 用の商品取り込みツールを置かない", () => {
    const studioTools = libFiles
      .filter(({ file }) => file.startsWith("src/lib/product-import/"))
      .map(({ file }) => file);
    expect(studioTools).toEqual([]);
  });
});
