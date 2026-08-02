import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .id("root")
    .title("コンテンツ")
    .items([
      S.listItem()
        .id("product-management")
        .title("商品管理")
        .child(
          S.list()
            .id("product-management-list")
            .title("商品管理")
            .items([
              // 在庫状況・ブランド・カテゴリごとの固定リストは用意しない。
              // Sanity Studioの標準ドキュメントリストには絞り込み機能（一覧右上の
              // フィルタアイコン）が組み込まれており、availability・brand・categories等
              // 任意のフィールドでその場で絞り込める。固定リストを増やすより
              // シンプルで、新しい絞り込み軸が欲しくなってもコード変更が不要
              S.documentTypeListItem("product").title("すべての商品"),
              S.divider(),
              S.documentTypeListItem("brand").title("ブランド"),
              S.documentTypeListItem("category").title("カテゴリ"),
              S.documentTypeListItem("priceSettings").title(
                "価格設定（デフォルト掛け率）"
              ),
              S.documentTypeListItem("designTheme").title("デザインテーマ"),
              S.divider(),
              S.documentTypeListItem("csvCatalog").title(
                "商品データソース（CSV）"
              ),
              S.documentTypeListItem("scrapingCatalog").title(
                "商品データソース（スクレイピング）"
              ),
              S.documentTypeListItem("productCsvUpload").title(
                "取り込み待ちCSV"
              ),
              S.documentTypeListItem("productImportRun").title(
                "インポート実行結果"
              ),
            ])
        ),
      S.divider(),
      S.documentTypeListItem("announcement").title("お知らせ"),
    ]);
