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
// いずれもStudio上では運営者が新規作成・編集できない「定数/ログ」として扱う
// （specs/004-product-data-import、ユーザーとの協議）。内容変更はコード側で行う。
// UIレベルでの誤操作防止であり、データセットへの書き込み権限を持つ場合は
// API経由で操作できてしまう点に注意（スキーマ側のreadOnlyと合わせた二重の防御）。
// scrapingCatalogは削除も禁止（開発コードと結びついた設定を誤って消させないため）。
// productImportRunは古いログの削除は許可する（監査ログの保持期間管理は運営者に委ねる）。
const STUDIO_NO_CREATE_EDIT_TYPES = ["scrapingCatalog", "productImportRun"];
const STUDIO_NO_DELETE_TYPES = ["scrapingCatalog"];

const document = {
  actions: (
    prev: import("sanity").DocumentActionComponent[],
    context: { schemaType: string }
  ) =>
    prev.filter(({ action }) => {
      if (STUDIO_NO_CREATE_EDIT_TYPES.includes(context.schemaType)) {
        if (action === "publish" || action === "duplicate") return false;
      }
      if (STUDIO_NO_DELETE_TYPES.includes(context.schemaType)) {
        if (action === "delete") return false;
      }
      return true;
    }),
  newDocumentOptions: (prev: import("sanity").TemplateItem[]) =>
    prev.filter(
      (item) => !STUDIO_NO_CREATE_EDIT_TYPES.includes(item.templateId)
    ),
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
