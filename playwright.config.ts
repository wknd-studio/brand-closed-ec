import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // CIのランナーはローカルより低速で、Sanity等の外部APIへのアクセスも
  // 余分にレイテンシがかかるため、テストごとのタイムアウトを長めにする
  timeout: process.env.CI ? 60000 : 30000,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  // BASE_URL が外部 URL（stg など）を指している場合はローカルサーバーを起動しない
  ...(!process.env.BASE_URL && {
    webServer: {
      // CI（e2e-prジョブ）ではローカルのephemeral Supabaseを使うようNEXT_PUBLIC_SUPABASE_URL等を
      // 明示的に上書きしているが、"pnpm dev"は内部で"doppler run -- next dev"を実行するため、
      // このネストしたdoppler run呼び出しがDopplerの設定値（本物の共有Supabaseプロジェクト）で
      // 上書きを覆してしまい、テストプロセスとサーバープロセスが別のDBに接続する不具合があった。
      // CIでは素の"next dev"を直接起動し、Playwright自身の環境（既に正しい値が入っている）を
      // そのまま継承させることでこれを回避する
      command: process.env.CI ? "pnpm exec next dev" : "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  }),
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
