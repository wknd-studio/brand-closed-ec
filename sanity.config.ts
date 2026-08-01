import { colorInput } from "@sanity/color-input";
import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schemas";
import { structure } from "./src/sanity/structure";
import { ProductImportTool } from "./src/sanity/tools/product-import/product-import-tool";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "0syeievd";
const plugins = [structureTool({ structure }), visionTool(), colorInput()];
const schema = { types: schemaTypes };
const tools = [
  {
    name: "product-import",
    title: "商品CSVインポート",
    component: ProductImportTool,
  },
];

// scrapingCatalogは開発者がスクレイピングコード(scrape_adapter_id)と一緒に
// 用意するドキュメントであり、Studio上では文字通りの「定数」として扱う
// （specs/004-product-data-import、ユーザーとの協議）。運営者は新規作成・編集・
// 削除のいずれもできず閲覧のみとし、内容変更はコード（シードスクリプト等）で行う。
// UIレベルでの誤操作防止であり、データセットへの書き込み権限を持つ場合は
// API経由で操作できてしまう点に注意（スキーマ側のreadOnlyと合わせた二重の防御）。
const document = {
  actions: (
    prev: import("sanity").DocumentActionComponent[],
    context: { schemaType: string }
  ) =>
    context.schemaType === "scrapingCatalog"
      ? prev.filter(
          ({ action }) =>
            action !== "publish" &&
            action !== "delete" &&
            action !== "duplicate"
        )
      : prev,
  newDocumentOptions: (prev: import("sanity").TemplateItem[]) =>
    prev.filter((item) => item.templateId !== "scrapingCatalog"),
};

export default defineConfig([
  {
    name: "staging",
    title: "BRAND Studio (Staging)",
    basePath: "/staging",
    projectId,
    dataset: "staging",
    plugins,
    schema,
    tools,
    document,
  },
  {
    name: "production",
    title: "BRAND Studio (Production)",
    basePath: "/production",
    projectId,
    dataset: "production",
    plugins,
    schema,
    tools,
    document,
  },
]);
