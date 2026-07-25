import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("コンテンツ")
    .items([
      S.listItem()
        .title("商品管理")
        .child(
          S.list()
            .title("商品管理")
            .items([
              S.documentTypeListItem("product").title("すべての商品"),
              S.divider(),
              S.listItem()
                .title("取り扱い中")
                .child(
                  S.documentList()
                    .title("取り扱い中の商品")
                    .schemaType("product")
                    .filter('_type == "product" && availability == "available"')
                ),
              S.listItem()
                .title("在庫切れ")
                .child(
                  S.documentList()
                    .title("在庫切れの商品")
                    .schemaType("product")
                    .filter(
                      '_type == "product" && availability == "out_of_stock"'
                    )
                ),
              S.listItem()
                .title("取り扱い終了")
                .child(
                  S.documentList()
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
            ])
        ),
      S.divider(),
      S.documentTypeListItem("announcement").title("お知らせ"),
    ]);
