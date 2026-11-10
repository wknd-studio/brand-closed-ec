/**
 * Query Service の形の検査（scripts/ci/query-service-shape.ts。#582）の、ファイルごとの設定。
 *
 * このファイルの変更（テストの置き場所・観点の置き換え）は検査を弱められるため、high-risk として
 * 人間がレビューする（.github/labeler.yml の scripts/ci/**）。
 */
export type QueryServiceOverride = {
  /** 規則の tests/integration/<supabase|sanity>-<対象>-query-service.test.ts の代わりに使うテスト */
  test?: string;
  /** 「他の会員のデータを取得できない」の代わりの観点（RLS の無いもの等） */
  otherMember: string;
  reason: string;
};

export type QueryServiceShapeConfig = {
  /** キーは src/queries/<対象>-query-service.ts */
  overrides: Record<string, QueryServiceOverride>;
};

export const QUERY_SERVICE_SHAPE: QueryServiceShapeConfig = {
  overrides: {
    "src/queries/catalog-query-service.ts": {
      test: "tests/unit/infrastructure/sanity-catalog-query-service.test.ts",
      otherMember: "閲覧できないランクの商品が返らない",
      reason:
        "Sanity には会員ごとのデータも RLS も無く、制限はランクによる表示制限だけ。実 Sanity の統合テスト（tests/integration/sanity-products.test.ts）は共有のデータセットに書き込むため既定では動かさず、Sanity のアダプタは SDK だけをモックしたユニットテストで確かめる（scripts/ci/layer-coverage.config.ts）",
    },
  },
};
