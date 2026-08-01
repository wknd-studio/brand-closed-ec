import type { MemberRankValue } from "@/domain/value-objects/member-rank";

/**
 * 統一商品データ形式（contracts/unified-product-schema.md参照）。
 * CSV由来・スクレイピング由来のいずれのデータも、Sanityへの書き込み前に必ずこの形へ変換される。
 */

export type ProductAvailability = "available" | "out_of_stock";
// "discontinued" は要確認フロー（FR-014）を経て反映するため、
// アダプターの出力段階では選択できない

export type UnifiedProductRecordOrigin =
  | { kind: "csv"; rowNumber: number }
  | { kind: "scraping"; sourceUrl: string };

export interface UnifiedProductRecord {
  /** 突合キー。存在する場合は最優先で使う（FR-004） */
  janCode?: string;

  /** 完全一致フォールバック突合に使う（FR-005） */
  name: string;
  brandName: string;

  retailPrice: number;

  /** 未指定のランクはproduct側のデフォルト掛け率設定に委ねる */
  rankPrices?: Partial<Record<MemberRankValue, number>>;

  availability: ProductAvailability;

  minRank?: MemberRankValue;

  /** どの業者由来かの記録。ProductImportRun・product.source_vendorに使う */
  vendorId: string;

  /** エラー報告時に「何行目/どの商品か」を示すための出所情報。Sanityへは書き込まない */
  origin: UnifiedProductRecordOrigin;
}
