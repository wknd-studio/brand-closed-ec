import { createClient } from "@sanity/client";

import { applyImport } from "@/lib/product-import/apply-import";
import type { CatalogScraper } from "@/lib/product-import/catalog-scraper";
import { describeOrigin } from "@/lib/product-import/unified-product-schema";
import { validateAndPreview } from "@/lib/product-import/validate-and-preview";

/**
 * scrapingCatalog1件分のオンデマンド実行（User Story 2, FR-008, FR-010, FR-022）。
 * GitHub Actionsのworkflow_dispatch（product-data-sync.yml）から`--catalog`を渡して実行される。
 * ページ構造の想定外の変化を検知した場合はscraper.scrape()が例外を投げ、このスクリプトも
 * 非ゼロ終了する。GitHub Actions上でジョブが失敗として表示されることが担当者への通知となる。
 */

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  token: process.env.SANITY_WRITE_TOKEN!,
  apiVersion: "2026-05-17",
  useCdn: false,
});

interface ScrapingCatalogDoc {
  _id: string;
  scrape_adapter_id: string;
}

export async function runOnDemand(
  catalogId: string,
  options: { dryRun: boolean } = { dryRun: false }
): Promise<void> {
  const startedAt = new Date();

  const catalog = await client.fetch<ScrapingCatalogDoc | null>(
    `*[_type == "scrapingCatalog" && _id == $catalogId][0]{ _id, scrape_adapter_id }`,
    { catalogId }
  );
  if (!catalog) {
    throw new Error(`scrapingCatalogが見つかりません: ${catalogId}`);
  }

  const scraper = await loadScraper(catalog.scrape_adapter_id);
  const records = await scraper.scrape();

  if (options.dryRun) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const knownBrandNames = await client.fetch<string[]>(
    `*[_type == "brand"].name`
  );
  const preview = validateAndPreview(records, knownBrandNames);

  const result = await applyImport({
    client,
    catalogId,
    triggeredBy: "on_demand",
    startedAt,
    outcome:
      preview.outcome === "aborted_error_threshold"
        ? "aborted_error_threshold"
        : "completed",
    validRecords: preview.validRecords,
    failureCount: preview.errorCount,
    errorDetails: preview.errors.map((e) => ({
      target: describeOrigin(e.origin),
      reason: e.reason,
    })),
  });

  console.log(
    `完了 (${catalogId}): outcome=${preview.outcome}, 新規作成/更新=${result.createdCount + result.updatedCount}件, エラー=${preview.errorCount}件`
  );
}

async function loadScraper(scrapeAdapterId: string): Promise<CatalogScraper> {
  const mod = (await import(`./vendors/${scrapeAdapterId}/scraper`)) as {
    default: CatalogScraper;
  };
  return mod.default;
}

function parseArgs(argv: string[]): { catalogId: string; dryRun: boolean } {
  const catalogArg = argv.find((a) => a.startsWith("--catalog="));
  const catalogId = catalogArg?.slice("--catalog=".length);
  const dryRun = argv.includes("--dry-run");
  if (!catalogId) {
    throw new Error(
      "実行対象を --catalog=<scrapingCatalogのドキュメントID> で指定してください"
    );
  }
  return { catalogId, dryRun };
}

const { catalogId, dryRun } = parseArgs(process.argv.slice(2));
runOnDemand(catalogId, { dryRun }).catch((err) => {
  console.error("エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
