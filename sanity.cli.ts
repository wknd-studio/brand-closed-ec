import path from "node:path";

import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "0syeievd",
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "staging",
  },
  deployment: {
    appId: "k4pj8obusw10p4ghtjufqbad",
  },
  // Sanity StudioはVite（Next.jsとは別のビルド設定）で動くため、tsconfig.jsonの
  // `@/* -> src/*` パスエイリアスを自動では認識しない。src/sanity/tools配下の
  // カスタムツールがsrc/lib配下の共有ロジックを`@/`で参照できるよう明示的に設定する
  // （specs/004-product-data-import。手動動作確認時にViteの解決エラーで判明）
  vite: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
});
