import type { UnifiedProductRecord } from "./unified-product-schema";

export interface ExistingProductRef {
  _id: string;
  janCode?: string;
  name: string;
  brandName: string;
}

export type DedupeResult =
  | { matched: true; productId: string }
  | { matched: false };

/**
 * 既存商品との重複を判定する（FR-004/005）。
 * レコードにJANコードがあればJANコードの一致のみで判定し、名前へのフォールバックは行わない。
 * JANコードが無いレコードのみ、商品名+ブランドの完全一致でフォールバック判定する。
 */
export function findMatchingProduct(
  record: UnifiedProductRecord,
  existingProducts: ExistingProductRef[]
): DedupeResult {
  if (record.janCode) {
    const match = existingProducts.find((p) => p.janCode === record.janCode);
    return match ? { matched: true, productId: match._id } : { matched: false };
  }

  const match = existingProducts.find(
    (p) => p.name === record.name && p.brandName === record.brandName
  );
  return match ? { matched: true, productId: match._id } : { matched: false };
}
