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
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    env: {
      BASE_URL: "http://localhost:3000",
    },
    // 層ごと・ファイルごとのカバレッジ検査（#455）。--coverage 付きで全テストを実行したときだけ動く
    coverage: layerCoverageOptions("unit"),
    reporters: ["default", new LayerCoverageReporter("unit")],
  },
});
