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

// scrapingCatalog（開発者がスクレイピングコードと一緒に用意する設定）と
// productImportRun（apply-import.tsがAPI経由で書き込む監査ログ）は、
// いずれもStudio上では運営者が新規作成・編集・削除できない「定数/ログ」として扱う
// （specs/004-product-data-import、ユーザーとの協議）。内容変更はコード側で行う。
// UIレベルでの誤操作防止であり、データセットへの書き込み権限を持つ場合は
// API経由で操作できてしまう点に注意（スキーマ側のreadOnlyと合わせた二重の防御）。
const STUDIO_LOCKED_TYPES = ["scrapingCatalog", "productImportRun"];

const document = {
  actions: (
    prev: import("sanity").DocumentActionComponent[],
    context: { schemaType: string }
  ) =>
    STUDIO_LOCKED_TYPES.includes(context.schemaType)
      ? prev.filter(
          ({ action }) =>
            action !== "publish" &&
            action !== "delete" &&
            action !== "duplicate"
        )
      : prev,
  newDocumentOptions: (prev: import("sanity").TemplateItem[]) =>
    prev.filter((item) => !STUDIO_LOCKED_TYPES.includes(item.templateId)),
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
