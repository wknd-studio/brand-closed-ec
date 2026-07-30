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

## Decision: Stripe Checkout決済確定はE2Eの対象外とし、Webhook統合テストに切り替える（重要な訂正）

- **Decision**: T002実装中の実機検証で、Playwrightからテストカード（`4242424242424242`）を入力してStripe Checkout画面を送信したところ、Stripeのボット検知（hCaptcha challenge）が発動し、決済が完了せず自アプリの`/`（→`/shop`）へ差し戻される事象が再現した。Stripe公式ドキュメント（`https://docs.stripe.com/automated-testing`）を確認したところ、以下が明記されている:

  > 「Stripe Checkout や Payment Element などのフロントエンドのシステムには、自動化されたテストを防ぐためのセキュリティ対策が講じられており」「疑似データを使用して Stripe のインターフェースと API リクエストの出力をシミュレートし、アプリケーションの動作とそのエラー処理能力をテストできます」

  つまりStripeは、ホスト画面自体を自動化ツールで操作されることを想定しておらず、それを防ぐ設計になっている。これに従い、**E2Eテストの範囲は「Stripe Checkout画面への遷移」の確認までとし、決済完了後の処理（Webhook受信→注文`paid`化）は、Stripe公式のテスト用ヘルパー`stripe.webhooks.generateTestHeaderString({ payload, secret })`で正しく署名した疑似`checkout.session.completed`イベントを`/api/webhooks/stripe`へ直接送信する統合テストとして検証する**方針に変更した

- **Rationale**: Stripe公式が推奨する方法に従うことで、hCaptcha発動によるフレーキーな失敗を避けられる。また`generateTestHeaderString`はStripeの公式SDK（`stripe` npmパッケージ）に含まれる正規のテストヘルパーであり、ハックではない
- **既存のE2Eテストへの影響**: `tests/e2e/auth/registration.spec.ts`・`tests/e2e/auth/onboarding.spec.ts`（`specs/002-e2e-auth-coverage`で実装済み）は確認したところ、いずれも「Stripe Checkout画面への遷移確認」で止まっており、カード情報の入力・送信は行っていない。既にStripe公式推奨のパターンに従っていたため、**変更不要**
- **同種の穴が別領域にも存在**: 会員登録時のサブスク決済確定処理（`completeSubscriptionOnboarding`）にも、実際のWebhookルート（署名検証込み）を通す統合テストが存在しないことが判明した。これはspecs/002の領域のため、`BRAND-146`として別issueに起票し、本featureのスコープには含めない
- **統合テストの実装方針**: `tests/integration/webhooks/stripe-checkout-webhook.test.ts`を新規作成する。実際に`placeOrder`で注文を作成し、その`stripeCheckoutSessionId`を含む`checkout.session.completed`イベント（`mode: "payment"`）を`generateTestHeaderString`で署名し、`/api/webhooks/stripe`のRoute Handler（`POST`関数）を直接呼び出す。実DBで対象注文が`paid`になることを確認する
- **Alternatives considered**: hCaptcha発動を許容しリトライで乗り切る → Stripe公式の推奨に反し、CIでの再現性が保証されないため却下

## Decision: Clerkのuser.createdイベントもWebhook配信を前提にせず、DBへ直接会員行を作成する（T002実装中の発見）

- **Decision**: 招待経由の新規サインアップ後にSupabaseの`users`行が作成されるのはClerkの`user.created`Webhook経由だが、実機検証でこのWebhookがローカル（`task dev:ngrok`未起動時）やCI環境（ngrok同等のトンネルが存在しない）では一切届かないことを確認した。Stripeのホスト画面と同じく、外部サービスからのWebhook配信自体をE2Eテストの前提にはできない。そのため`checkout.spec.ts`の`registerAndMarkOnboarded`では、Webhookの到着を待つのではなく、`users`行自体をテスト側で直接insertする方式にした
- **Rationale**: 既存の`registration.spec.ts`・`onboarding.spec.ts`はこの行の作成完了を一切待たずに完結する（前者はStripe Checkout画面への遷移確認まで、後者は固定のシード済みテストアカウントを使う）ため、この問題が顕在化していなかった。本featureで初めて「招待経由の新規サインアップ→オンボーディング完了済み状態でショップ画面を使う」という組み合わせが必要になり発覚した
- **既存のE2Eテストへの影響**: なし（`registration.spec.ts`・`onboarding.spec.ts`は変更不要）
- **Alternatives considered**: CI・ローカルの両方にngrok等のトンネルを常設する → 外部トンネルへの継続的な依存が増え、Stripeの件と同様の理由（外部サービスの可用性にE2Eの安定性を委ねるべきではない）で却下

## Decision: `cleanupTestUser`ヘルパーの2つの潜在バグを修正した（T002実装中の発見）

- **Decision**: `tests/e2e/helpers/clerk-test-invitation.ts`の`cleanupTestUser`に以下2つのバグがあり修正した
  1. Clerk側API呼び出し（`getClerkUserIdByEmail`・`clerk.users.deleteUser`等）の失敗がtry/catchされておらず、例外が伝播すると後続のSupabase側の`users`削除が一切実行されなかった
  2. `users`の削除がテスト中に作成した`addresses`/`orders`（`user_id`外部キー）に阻まれて失敗するケースを検知しておらず、削除エラーを無視したまま「削除済み」として扱っていた
- **Rationale**: この環境ではClerkのFAPI/Backend APIが断続的に失敗することがあり（`SyntaxError: Unexpected token '<'`等）、(1)が実際に発生してテスト用会員行が残り続けた。また`checkout.spec.ts`が初めて住所・注文をテスト中に作成するE2Eのため(2)も初めて顕在化した。修正により、Clerk側の後片付けはベストエフォート、Supabase側は関連テーブル（order_items→orders→addresses→users）を順に削除してから確実に削除する
- **既存のE2Eテストへの影響**: なし（`registration.spec.ts`・`onboarding.spec.ts`は住所・注文を作らないため実質的に影響を受けていなかった）

## Decision: 月次上限チェックはカート追加時（クライアント側）と注文確定時（サーバー側）の2箇所に存在する（T004実装中の発見）

- **Decision**: `src/lib/cart/context.tsx`の`addToCart`にも、`confirmedAmount + カート内合計 + 追加分 > monthlyLimit`の場合に追加自体を拒否するクライアント側チェックが存在することが判明した。シナリオ3（月次仕入れ上限超過）で検証したいのは`place-order.ts`のサーバー側`checkMonthlyLimit`（注文確定時）だが、先に上限超過となる確定済み注文をDBに作成してからカートに追加しようとすると、カート追加自体がクライアント側チェックでブロックされてしまい意図した検証にならない。そのため、テストの手順を「(1)カートに追加 (2)その後に上限超過となる確定済み注文をDBへ直接作成 (3)チェックアウト画面で注文確定を試みる」の順にした
- **Rationale**: カートは一度追加されればCookieに保持され、その後の確定済み金額の変化には影響されない。この順序であれば、カート追加時点では確定済み金額がまだ増えていないため通過し、注文確定時にはサーバー側の`checkMonthlyLimit`が正しくブロックする
- **Alternatives considered**: クライアント側チェックを回避するため直接Cookieを操作してカート内容を注入する → 実装の詳細に依存しすぎるテストになり、UI操作としての自然さを損なうため却下

## Decision: Clerk FAPIの断続的な失敗はGitHub Actions側のIPベースのレート制限が原因と特定した（login/onboarding安定化作業中の発見）

- **Decision**: CIの実行ログに繰り返し出現する`[Clerk Testing] FAPI request failed after 4 attempts... SyntaxError: Unexpected token '<', "<!DOCTYPE "`という警告について、これまで「よくあるノイズ」として扱ってきたが、実際に根本原因を調査した。`@clerk/testing`のソースを確認したところ、この警告はFAPIへのリクエストをテスト用トークン付きで再送信し、レスポンスを`.json()`でパースしようとして失敗した（＝JSONではなくHTMLが返ってきた）場合に発生する。Clerk公式ドキュメントでは「Frontend APIリクエストはユーザー・IPアドレス単位でレート制限されている」「Cloudflare Turnstileによるボット検知が組み込まれており、99.9%のユーザーには見えないが必要な場合にチャレンジが表示される」ことが明記されている。`setupClerkTestingToken`が付与するTesting Tokenは**ボット検知（Turnstile）を回避するためのものであり、IPベースのレート制限は回避しない**。GitHub Actionsのホスト型ランナーは他の無数のユーザー・組織とIPレンジを共有しているため、他のトラフィックによる制限に巻き込まれている可能性が高いと結論づけた
- **検証事実**: ローカル・CIともに`global.setup.ts`はClerk公式が推奨する「project-based setup」パターン（`function-based globalSetup`ではない）に従っており、`CLERK_FAPI`/`CLERK_TESTING_TOKEN`環境変数が実際のテストワーカーに正しく伝播していることをローカルで実機確認済み（テスト用の一時ファイルでの検証）。つまりテスト側の設定・実装に不備があるわけではない
- **Rationale**: この仮説は以下の観察と整合する。(1) ローカルではほぼ発生しない（専用IPのため）が、CIでは高頻度に警告が出る。(2) それでもCIの大半のテスト実行は成功している——`@clerk/testing`自体が4回までの指数バックオフ再試行を内蔵しており、大半のケースはこれで自己回復しているため。(3) ごく一部だけ実際の失敗に繋がる——再試行のタイミングでも運悪くレート制限に引っかかり続けた場合のみ
- **今後の方針への影響**: CIの`workers`を1より大きくして並列化することは、Clerkへの同時リクエスト数を増やしレート制限に引っかかる頻度をむしろ上げる可能性があるため、この問題が解消される確証が得られるまでは見送る。この種の断続的失敗は自分たちのコードのバグではなく共有IPインフラに起因する構造的な制約であり、完全に解消することは難しい。Playwrightのリトライ（CI: 2回）と`@clerk/testing`自身の再試行機構に引き続き委ねる
- **Alternatives considered**: 自前でリトライ処理を追加実装する → `@clerk/testing`が既に同種の再試行を内蔵しているため二重対応になり不要。専用IPを持つセルフホストランナーへの移行 → コスト・運用負荷に見合わないため現時点では見送り

## NEEDS CLARIFICATION（未解決）

- なし。実装時に確認が必要な点（Stripe Checkout画面のロケーター）はtasks.mdの最初のタスクとして明記し、ブロッカーにはしない
