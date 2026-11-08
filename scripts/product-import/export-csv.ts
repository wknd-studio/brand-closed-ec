import * as fs from "node:fs";
import * as path from "node:path";

import { unifiedRecordsToCsv } from "@/lib/product-import/csv-export";
import type { CatalogScraper } from "@/lib/product-import/catalog-scraper";

/**
 * 技術者が手元で実行する、スクレイピング結果をCSVファイルへ書き出すCLI（User Story 2）。
 * Sanity Studioからの起動導線（ボタン・トリガーAPI）は持たない。運営者は生成された
 * CSVファイルを、既存のCSVインポート画面（User Story 1, 検証プレビュー→確定）から
 * いつも通りアップロードする。この形にすることで、オンデマンド実行専用に用意していた
 * GitHub PAT・CORS対応等を丸ごと不要にし、書き込み前の人間によるレビューも自然に担保する
 * （ユーザーとの協議による設計変更。旧run-on-demand.ts・トリガーAPIは廃止）。
 *
 * 使い方: doppler run -- pnpm tsx scripts/product-import/export-csv.ts --adapter=<id>
 */

async function loadScraper(scrapeAdapterId: string): Promise<CatalogScraper> {
  const mod = (await import(`./vendors/${scrapeAdapterId}/scraper`)) as {
    default: CatalogScraper;
  };
  return mod.default;
}

function parseArgs(argv: string[]): { adapter: string; out: string } {
  const adapterArg = argv.find((a) => a.startsWith("--adapter="));
  const adapter = adapterArg?.slice("--adapter=".length);
  if (!adapter) {
    throw new Error(
      "スクレイピング対象を --adapter=<vendors配下のディレクトリ名> で指定してください"
    );
  }

  const outArg = argv.find((a) => a.startsWith("--out="));
  const out =
    outArg?.slice("--out=".length) ??
    path.join("tmp", `${adapter}-${new Date().toISOString().slice(0, 10)}.csv`);

  return { adapter, out };
}

async function main() {
  const { adapter, out } = parseArgs(process.argv.slice(2));
  const scraper = await loadScraper(adapter);
  const records = await scraper.scrape();
  const csv = unifiedRecordsToCsv(records);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, csv, "utf-8");

  console.log(`${records.length}件を書き出しました: ${out}`);
  console.log(
    "Sanity Studioの「CSVインポート」画面から、このファイルをアップロードして内容を確認・確定してください。"
  );
}

main().catch((err) => {
  console.error("エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
