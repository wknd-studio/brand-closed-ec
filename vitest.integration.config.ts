import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

import {
  LayerCoverageReporter,
  layerCoverageOptions,
} from "./scripts/ci/layer-coverage";

export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    env: {
      BASE_URL: "http://localhost:3000",
    },
    // 層ごと・ファイルごとのカバレッジ検査（#455）。--coverage 付きで全テストを実行したときだけ動く
    coverage: layerCoverageOptions("integration"),
    reporters: ["default", new LayerCoverageReporter("integration")],
  },
});
