import { colorInput } from "@sanity/color-input";
import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { schemaTypes } from "./src/sanity/schemas";
import { structure } from "./src/sanity/structure";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "0syeievd";
const plugins = [structureTool({ structure }), visionTool(), colorInput()];
const schema = { types: schemaTypes };

export default defineConfig([
  {
    name: "staging",
    title: "BRAND Studio (Staging)",
    basePath: "/staging",
    projectId,
    dataset: "staging",
    plugins,
    schema,
  },
  {
    name: "production",
    title: "BRAND Studio (Production)",
    basePath: "/production",
    projectId,
    dataset: "production",
    plugins,
    schema,
  },
]);
