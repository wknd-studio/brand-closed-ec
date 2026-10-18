// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

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
    // Vitestのカバレッジ出力:
    "coverage/**",
    // Storybook build output:
    "storybook-static/**",
    // Wranglerのローカル状態・ビルド成果物:
    ".wrangler/**",
    // Vercel CLIのローカル設定:
    ".vercel/**",
    // npx skills add で導入したベンダー製スキル（自プロジェクトのコード規約対象外）:
    ".agents/**",
    ".claude/skills/**",
    // Claude Codeが作るワークツリー（各ワークツリーのsrc/・.next/等を丸ごと含む）:
    ".claude/worktrees/**",
  ]),
  ...storybook.configs["flat/recommended"],
]);

export default eslintConfig;
