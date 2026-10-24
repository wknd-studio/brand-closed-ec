import type { LayerCoverageConfig } from "./layer-coverage";

/**
 * 層ごとのカバレッジ検査の対象・閾値・例外（#455。検査の中身は scripts/ci/layer-coverage.ts）。
 *
 * このファイルの変更（閾値を下げる・例外を足す）は high-risk として人間がレビューする
 * （.github/labeler.yml の scripts/ci/**）。
 *
 * 閾値は「層に合った種類のテストで実行されていること」の担保が目的で、網羅率の競争ではない。
 * 導入時（2026-10-24）の計測値を見て、domain・use-cases は高め、それ以外は低めから始めた。
 *
 * interface だけの src/repositories/**・src/queries/** は対象にしない。
 */
export const LAYER_COVERAGE: LayerCoverageConfig = {
  layers: [
    {
      name: "domain（エンティティ・値オブジェクト・ドメインサービス）",
      suite: "unit",
      include: ["src/domain/**/*.ts"],
      minLines: 80,
      howToTest: "ユニットテスト（DBもモックも無し）で、計算・分岐を確かめる",
    },
    {
      name: "use-cases",
      suite: "unit",
      include: ["src/use-cases/**/*.ts"],
      minLines: 80,
      howToTest:
        "ユニットテスト（リポジトリをモック）で、冪等性・ロールバック等の分岐を確かめる",
    },
    {
      name: "外部サービスのアダプタ",
      suite: "unit",
      include: ["src/infrastructure/{stripe,clerk,resend,sanity}/**/*.ts"],
      minLines: 50,
      howToTest:
        "ユニットテストで、SDK だけをモックし、アダプタ自身のコード（SDK に渡す引数・戻り値の変換）を実行する",
    },
    {
      // #450 で src/infrastructure/supabase/ に置く。リポジトリ実装より先に書き、こちらとして案内する
      name: "Query Service の Supabase 実装",
      suite: "integration",
      include: ["src/infrastructure/supabase/**/*query*.ts"],
      minLines: 50,
      howToTest:
        "統合テスト（実DB接続）で、取得できる・他の会員のデータを取得できない・存在しないケースを確かめる",
    },
    {
      name: "Supabase のリポジトリ実装",
      suite: "integration",
      include: ["src/infrastructure/supabase/**/*.ts"],
      minLines: 50,
      howToTest:
        "統合テスト（実DB接続）で、実際の SELECT・RLS がエラーにならず通ることを確かめる",
    },
    {
      name: "APIルート（Webhookハンドラー等）",
      suite: "integration",
      include: ["src/app/api/**/route.ts"],
      minLines: 50,
      howToTest:
        "統合テスト（実DB + route の POST 等を Request で直接呼ぶ）で、署名検証を含めた一連の処理を確かめる",
    },
  ],
  // 閾値を下回るが、テストの追加を別issueで行うファイル。テストを足して閾値を満たしたら、
  // 検査が「例外から外す」よう失敗するので削除する
  exceptions: [
    {
      file: "src/infrastructure/clerk/clerk-account-gateway.ts",
      suite: "unit",
      issue: 523,
    },
    {
      file: "src/infrastructure/resend/resend-notification-service.ts",
      suite: "unit",
      issue: 523,
    },
    {
      file: "src/infrastructure/stripe/stripe-subscription-gateway.ts",
      suite: "unit",
      issue: 523,
    },
    {
      file: "src/infrastructure/supabase/supabase-address-repository.ts",
      suite: "integration",
      issue: 524,
    },
  ],
};
