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
              S.documentTypeListItem("product").title("すべての商品"),
              S.divider(),
              S.listItem()
                .id("product-available")
                .title("取り扱い中")
                .child(
                  S.documentList()
                    .id("product-available-list")
                    .title("取り扱い中の商品")
                    .schemaType("product")
                    .filter('_type == "product" && availability == "available"')
                ),
              S.listItem()
                .id("product-out-of-stock")
                .title("在庫切れ")
                .child(
                  S.documentList()
                    .id("product-out-of-stock-list")
                    .title("在庫切れの商品")
                    .schemaType("product")
                    .filter(
                      '_type == "product" && availability == "out_of_stock"'
                    )
                ),
              S.listItem()
                .id("product-discontinued")
                .title("取り扱い終了")
                .child(
                  S.documentList()
                    .id("product-discontinued-list")
                    .title("取り扱い終了の商品")
                    .schemaType("product")
                    .filter(
                      '_type == "product" && availability == "discontinued"'
                    )
                ),
              S.divider(),
              S.documentTypeListItem("brand").title("ブランド"),
              S.documentTypeListItem("category").title("カテゴリ"),
              S.documentTypeListItem("priceSettings").title(
                "価格設定（デフォルト掛け率）"
              ),
              S.documentTypeListItem("designTheme").title("デザインテーマ"),
            ])
        ),
      S.divider(),
      S.documentTypeListItem("announcement").title("お知らせ"),
    ]);
