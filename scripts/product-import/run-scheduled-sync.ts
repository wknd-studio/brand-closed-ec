import * as fs from "node:fs";
import * as path from "node:path";

import { createClient, type SanityClient } from "@sanity/client";

import { unifiedRecordsToCsv } from "@/lib/product-import/csv-export";
import { filterAdapterDirectories } from "@/lib/product-import/filter-adapter-directories";
import type { CatalogScraper } from "@/lib/product-import/catalog-scraper";

const VENDORS_DIR = path.join(__dirname, "vendors");

/**
 * GitHub Actionsの日次cronから実行される、業者サイトの定期スクレイピング（User Story 3）。
 * `scripts/product-import/vendors/`配下の各アダプターを実行し、結果をCSV化して
 * 対象csvCatalogの`pending_csv`フィールドに保存するだけで、商品データへの
 * 直接書き込み（apply-import呼び出し）は行わない。CSVインポート画面の
 * 検証プレビュー→人間による確定という安全機構を、定期実行でも必ず経由させるため
 * （Phase4で確立した方針をPhase5にも適用。ユーザーとの協議）。
 * 既に未確定のpending_csvが残っていた場合は、最新のスクレイピング結果で上書きする
 * （1カタログにつき保留中のCSVは常に最大1件という設計。ユーザーとの協議）。
 * catalog単位の失敗は他catalogの処理を止めずスキップし、productImportRunに
 * 失敗として記録する（Edge Cases）。
 */
async function main() {
  const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    token: process.env.SANITY_WRITE_TOKEN!,
    apiVersion: "2026-05-17",
    useCdn: false,
  });

  const adapterIds = filterAdapterDirectories(fs.readdirSync(VENDORS_DIR));

  for (const adapterId of adapterIds) {
    await runAdapter(client, adapterId);
  }
}

async function loadScraper(adapterId: string): Promise<CatalogScraper> {
  const mod = (await import(`./vendors/${adapterId}/scraper`)) as {
    default: CatalogScraper;
  };
  return mod.default;
}

async function runAdapter(client: SanityClient, adapterId: string) {
  let scraper: CatalogScraper;
  try {
    scraper = await loadScraper(adapterId);
  } catch (err) {
    console.error(`[${adapterId}] アダプターの読み込みに失敗しました:`, err);
    return;
  }

  const startedAt = new Date();
  try {
    const records = await scraper.scrape();
    const csv = unifiedRecordsToCsv(records);
    const dateLabel = startedAt.toISOString().slice(0, 10);

    const asset = await client.assets.upload(
      "file",
      Buffer.from(csv, "utf-8"),
      {
        filename: `${adapterId}-${dateLabel}.csv`,
        contentType: "text/csv",
      }
    );

    await client
      .patch(scraper.catalogId)
      .set({
        pending_csv: {
          file: {
            _type: "file",
            asset: { _type: "reference", _ref: asset._id },
          },
          source: "scheduled_scrape",
          uploaded_at: new Date().toISOString(),
        },
      })
      .commit();

    await client.create({
      _type: "productImportRun",
      catalog: { _type: "reference", _ref: scraper.catalogId },
      triggered_by: "scheduled",
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      outcome: "completed",
      success_count: records.length,
      failure_count: 0,
      needs_review_count: 0,
      error_details: [],
    });

    console.log(
      `[${scraper.catalogId}] ${records.length}件を取り込み待ちCSVとして保存しました`
    );
  } catch (err) {
    console.error(`[${scraper.catalogId}] スクレイピングに失敗しました:`, err);
    await client.create({
      _type: "productImportRun",
      catalog: { _type: "reference", _ref: scraper.catalogId },
      triggered_by: "scheduled",
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      outcome: "failed",
      success_count: 0,
      failure_count: 0,
      needs_review_count: 0,
      error_details: [
        {
          target: adapterId,
          reason: err instanceof Error ? err.message : String(err),
        },
      ],
    });
  }
}

main().catch((err) => {
  console.error("run-scheduled-sync.tsが異常終了しました:", err);
  process.exit(1);
});
