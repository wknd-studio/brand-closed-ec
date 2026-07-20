import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare opennext build output:
    ".open-next/**",
    // Sanity Studio build output:
    "dist/**",
    // Sanity CLI runtime:
    ".sanity/**",
    // Playwright実行時の生成物:
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
