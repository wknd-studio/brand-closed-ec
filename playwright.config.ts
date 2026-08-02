import { defineConfig, devices } from "@playwright/test";

// シークレットは.env.localではなくDopplerで一元管理する。
// ローカル実行時は`task test:e2e`（内部で`doppler run -- pnpm test:e2e`）を使うこと
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
      // CIでは素のコマンドを直接起動し、Playwright自身の環境（既に正しい値が入っている）を
      // そのまま継承させることでこれを回避する。
      //
      // また、CIでは開発モード（next dev）ではなく、実際にデプロイされる形と同じ
      // Cloudflare Workers本番ビルド（opennextjs-cloudflare build → wrangler dev）を使う。
      // 開発モードは各ページを初回アクセス時にオンデマンドでコンパイルするため、GitHub Actionsの
      // 非力な共有ランナー上では初回アクセスに数秒〜十数秒かかることがあり、これがテストの
      // タイムアウト（画面遷移待ちの5〜15秒・テスト全体の60秒）を超えてflakyな失敗の原因になっていた
      // （実際のCIトレースで/shop等への初回アクセスに6〜7秒かかっていたことを確認済み）。
      // 本番ビルドは全ページを事前コンパイル済みのため、この遅延が発生しない。
      // なお`next build && next start`ではダメで、このアプリはmiddleware.tsで
      // `getCloudflareContext()`（実際のCloudflare Workersランタイム上でのみ動く関数。
      // next devでは`initOpenNextCloudflareForDev()`による開発用の代替実装が使われる）を
      // 呼んでいるため、素のNode.jsサーバーであるnext startでは全リクエストがエラーになる
      // （実機検証済み）。wrangler devは実際にworkerdランタイム上でビルド成果物を動かすため、
      // 高速かつ`getCloudflareContext()`も正しく動作する。
      // CLOUDFLARE_INCLUDE_PROCESS_ENV=trueは、.dev.vars/.env.localが存在しない場合に
      // process.env（Playwrightが継承した、Doppler・Supabase上書き済みの環境）をそのまま
      // Workerのenvへ渡すためのCloudflare公式の仕組み（.dev.vars未使用時のみ有効。実機検証済み）。
      // NEXT_PUBLIC_*系はクライアントバンドルにビルド時に埋め込まれるため、
      // ビルド（opennextjs-cloudflare build）もこの正しい環境変数がある状態で実行する必要がある
      command: process.env.CI
        ? "pnpm run build:cloudflare && CLOUDFLARE_INCLUDE_PROCESS_ENV=true pnpm exec wrangler dev --port 3000"
        : "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      // ビルド自体に数十秒〜数分かかるため、サーバー起動待ちのタイムアウトを延長する
      timeout: process.env.CI ? 300000 : 120000,
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
