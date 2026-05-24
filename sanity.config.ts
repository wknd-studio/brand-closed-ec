import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schemas";

export default defineConfig({
  name: "brand-studio",
  title: "BRAND Studio",
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "0syeievd",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "staging",
  plugins: [
    structureTool(),
    visionTool(), // GROQ クエリをStudio上で試せる開発ツール
  ],
  schema: {
    types: schemaTypes,
  },
});
