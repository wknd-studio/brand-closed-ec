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
// 用意するドキュメントであり、運営者がStudio上で新規作成・削除すべきではない
// （specs/004-product-data-import）。UIレベルでの誤操作防止であり、
// データセットへの書き込み権限を持つ場合はAPI経由で操作できてしまう点に注意。
const document = {
  actions: (
    prev: import("sanity").DocumentActionComponent[],
    context: { schemaType: string }
  ) =>
    context.schemaType === "scrapingCatalog"
      ? prev.filter(
          ({ action }) => action !== "delete" && action !== "duplicate"
        )
      : prev,
  newDocumentOptions: (
    prev: import("sanity").TemplateItem[],
    context: { creationContext: { type: string } }
  ) =>
    context.creationContext.type === "global"
      ? prev.filter((item) => item.templateId !== "scrapingCatalog")
      : prev,
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
