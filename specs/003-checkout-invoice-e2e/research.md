# Phase 0 Research: カタログ〜チェックアウト・決済確定フローのE2Eテスト網羅

## Decision: Stripe Checkout画面の実際のロケーター（T001実機確認済み）

- **Decision**: Stripe Checkoutのカード情報入力欄は、想定していた`iframe`越しのアクセスではなく、`page.getByLabel("カード番号")`・`page.getByLabel("有効期限")`で直接操作できることを実機確認した。CVCのみ`page.getByLabel("CVC")`だとCVCアイコン画像と衝突するため`page.getByRole("textbox", { name: "CVC" })`で絞り込む。カード名義は`page.getByLabel("カード名義 (ローマ字)")`。送信ボタンは`page.getByRole("button", { name: "申し込む" })`
- **Rationale**: 推測ではなく実機確認により確定。Stripe Checkoutは完全に別ホストのページのため、`frameLocator`が不要だったのは実装がシンプルな`iframe`を使っていないため（決済情報入力欄自体はページ本体のDOMに存在する）
- **決済完了後の挙動（実機確認済み）**: 送信後、フォームが一時的に無効化され（ボタンラベルが「プロセス」に変化）、数秒後に元のアプリドメイン（`localhost:3000/onboarding/payment/success?session_id=...`等の`success_url`）へリダイレクトされる。このリダイレクト直後に一瞬`/sign-in`へ飛ぶことがあるが、Clerkのセッション再ハイドレーションによる一時的な遷移で、再度ページ操作すれば認証状態は保持されている
- **重要な発見: ローカル/CIでのStripe Webhook転送が必須**: 決済完了後のWebhook処理（`onboarding_completed`のtrue化、注文の`paid`化等）は、`stripe listen --forward-to localhost:3000/api/webhooks/stripe`によるWebhook転送が実行されていないと一切反映されない。ローカル開発では既に`Taskfile.yml`の`task dev`（`dev:stripe`タスク）でこの転送が組み込まれている。CIの`e2e-pr`ジョブには存在しなかったため、`.github/workflows/deploy.yml`に`Install Stripe CLI`（`npm install -g @stripe/cli`）ステップと、テスト実行前に`stripe listen`をバックグラウンド起動するコマンドを追加した
- **署名シークレットは固定値**: `stripe listen`が発行する`STRIPE_WEBHOOK_SECRET`（`whsec_...`）はStripeアカウント（テストモードAPIキー）に紐づく固定値であり、実行のたびに変わるものではない（`--print-secret`で2回確認し同一値であることを確認済み）。Doppler`dev`configには既にこの値が正しく設定されていたため、CI側での動的な値の受け渡しは不要だった
- **Alternatives considered**: なし。当初は実装フェーズでの実機確認を予定していたが、T001の中で前倒しで確認した

## Decision: 既存住所の準備はSupabaseへの直接作成、新規住所は実際のフォーム操作

- **Decision**: 「登録済み住所がある」経路（spec.mdのシナリオb）のテスト事前準備は、Supabaseへ`addresses`テーブルへ直接insertすることで作る（`tests/integration/use-cases/place-order.test.ts`で確立した住所作成パターンを踏襲）。「登録済み住所がない」経路（シナリオa）は、そもそも住所を作らない新規会員でテストし、実際のチェックアウト画面の住所入力フォームを操作する
- **Rationale**: 事前準備としての住所作成はテスト対象（チェックアウト画面の住所選択・入力UI）そのものではないため、DB直接作成で効率化してよい。一方、新規入力の経路は「実際にフォームへの入力が機能するか」を検証する対象そのものなので、実際のUI操作を行う
- **Alternatives considered**: 両経路とも実際の住所登録画面（`/settings`配下）を先に操作する方法 → 可能だがテストが長くなり、チェックアウト画面自体の検証という主目的から外れるため採用しない

## Decision: 注文ステータスの検証はSupabaseへの直接照会（ポーリング）で行う

- **Decision**: `会員が確認できること`はUI遷移（Stripe Checkout画面への遷移、決済完了後の画面への遷移）のみとし、`システムが保証すること`（Stripe webhook処理後に`paid`になること）はSupabaseへの直接照会で検証する。Stripe webhookの処理は非同期のため、`expect.poll()`等で一定時間内にステータスが`paid`になることを待つ
- **Rationale**: 会員向け画面に注文ステータスを表示する箇所が現状存在しない（`/order/complete`は注文内容の表示のみ）。管理画面（`/admin/orders/[id]`）を使う方法は、E2Eテスト内で会員セッションと管理者セッションの両方を扱う必要があり複雑化するため採用しない。この判断はspec.mdのAssumptionsに明記済み
- **Alternatives considered**: 管理画面から注文ステータスを確認する → 別セッション管理が必要になり複雑化するため却下

## Decision: 月次上限超過の検証は注文確定時（checkout画面操作）のみ。請求書発行時の別チェックはスコープ外

- **Decision**: `place-order.ts`の`checkMonthlyLimit`（注文確定時、checkout/invoice共通）による上限超過ブロックは、実際のチェックアウト画面操作でエラー表示・非遷移を確認する（User Story 1に含める）。`issue-invoice.ts`の`issueInvoice`（要相談商品の請求書発行時、運営者が交渉後価格を確定するタイミング）による別の上限チェックは、運営者側の管理画面オペレーションのため本featureのスコープ外とし、`BRAND-137`として別issueに起票済み
- **Rationale**: 前者は会員が実際に操作する画面から検証可能だが、後者は運営者ペルソナの操作が必要で別ドメイン。上限判定ロジック自体の正しさは`specs/001-seven-rank-pricing`のUser Story 3で既に検証済みのため、本featureでは「実際の画面操作でブロックされるか」というUI層の確認のみを追加する
- **Alternatives considered**: 請求書発行時のチェックも本featureに含める → 運営者側の別ドメインのテストを会員購買フローのspecに混在させることになり、テストの見通しが悪くなるため却下

## Decision: 要相談商品はテスト専用のSanityドキュメントを都度作成する

- **Decision**: `scripts/seed-products.ts`のシードデータには`is_negotiable: true`の商品が1件も存在しないことが判明した。User Story 2のテストでは、`tests/integration/sanity-products.test.ts`（`specs/001-seven-rank-pricing`）で確立したパターンと同様、テスト専用のブランド・要相談商品をSanity APIで作成し、テスト後に削除する
- **Rationale**: 共有のシードデータに依存すると、他の作業でシードデータが変更された際にテストが壊れるリスクがある。テスト専用データを都度作成・削除する方が独立性が高い
- **既存データを誤って削除しないための設計**: `sanity-products.test.ts`で確立したパターンを踏襲し、テスト用ドキュメントには明示的な固定ID（例: `test-invoice-brand-003`・`test-invoice-product-003`）を付けて`beforeAll`で作成し、`afterAll`で同じ固定IDを指定した`delete(id)`のみで削除する。Sanityの`delete(id)`はそのID1件のみを削除する操作であり、検索条件による一括削除は使わないため、既存の商品・ブランドデータに影響する可能性は構造的にない
- **Alternatives considered**: `scripts/seed-products.ts`に要相談商品を恒久的に追加する → 検討したが、シードデータの変更は本featureのスコープ外（テスト追加のみ）であり、テスト専用データの動的作成で十分なため採用しない

## Decision: 既存のtests/e2e/helpers/clerk-test-invitation.tsをそのまま再利用する

- **Decision**: 招待作成・クリーンアップは新規ヘルパーを作らず、`specs/002-e2e-auth-coverage`で作成した`createTestInvitation`/`cleanupTestUser`をそのまま使う
- **Rationale**: 会員登録の仕組みは既に確立済みで、本featureで変更する理由がない
- **Alternatives considered**: なし

## NEEDS CLARIFICATION（未解決）

- なし。実装時に確認が必要な点（Stripe Checkout画面のロケーター）はtasks.mdの最初のタスクとして明記し、ブロッカーにはしない
