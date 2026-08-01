/**
 * 商品データインポート機能の設定値。
 * spec.md・plan.md・Studio UI表示・.github/workflows/product-data-sync.ymlの
 * schedule設定は、いずれもこのファイルを正とする（値を複数箇所に書き写さない。Constitution原則V）。
 */

/** エラー行の割合がこれを超えたら、有効な行を含め一切書き込みを行わず中止する（FR-020） */
export const IMPORT_ERROR_THRESHOLD_RATIO = 0.3;

/**
 * 定期実行の頻度（FR-012: 日次）。
 * `.github/workflows/product-data-sync.yml` の `schedule.cron` はこの値と一致させること。
 */
export const SCHEDULED_SYNC_CRON = "0 0 * * *"; // 毎日 UTC 0:00（JST 9:00）
