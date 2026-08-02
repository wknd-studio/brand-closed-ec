import type { ExistingProductRef } from "./dedupe";
import type { UnifiedProductRecord } from "./unified-product-schema";

/**
 * 前回まで存在した商品（Sanity上のproduct）が、今回のスクレイピング結果に
 * 存在しなくなったものを検知する（FR-013）。比較対象は「前回のCSV」ではなく
 * 「実際にSanityへ反映済みの商品」にする。CSVは人間の確定操作を経るまで
 * Sanityに反映されないため、CSV同士の比較では実態と一致しない場合がある
 * （ユーザーとの協議）。
 * 判定はdedupe.tsと同じ優先順位: JANコードがあればJANコード一致のみで判定し、
 * 無い場合のみ商品名+ブランドの完全一致で判定する。
 */
export function detectDisappearedProducts(
  existingProducts: ExistingProductRef[],
  scrapedRecords: UnifiedProductRecord[]
): ExistingProductRef[] {
  return existingProducts.filter((existing) => {
    const stillPresent = scrapedRecords.some((record) =>
      existing.janCode
        ? record.janCode === existing.janCode
        : record.name === existing.name &&
          record.brandName === existing.brandName
    );
    return !stillPresent;
  });
}
