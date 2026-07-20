# Phase 0 Research: 会員登録・ログインフローのE2Eテスト網羅

## Decision: 招待リンクはClerk公式APIの`url`フィールドを直接使う

- **Decision**: `clerkClient.invitations.createInvitation({ emailAddress, redirectUrl, ignoreExisting: true })`を呼び、レスポンスの`url`フィールド（`@clerk/backend`の`Invitation`型で`readonly url?: string`と定義されている、実際のメールに記載されるURLそのもの）へ`page.goto()`する
- **Rationale**: 管理画面（`src/app/api/admin/invitations/route.ts`）が使っているAPIと完全に同一であり、実際のメール受信・クリックを模擬できる。メールを読む仕組み（Mailpit等）を別途用意する必要がない
- **Alternatives considered**: Mailpit（ローカルSupabaseに付随するメールキャッチャー、`docs/cicd.md`に記載あり）からメール本文をパースしてリンクを抽出する方式 → Clerkの招待メールはSupabase Mailpitを経由しない（Clerk自身が送信するため）ため、そもそも使えない

## Decision: テストユーザーのクリーンアップは共通ヘルパーに集約する

- **Decision**: `tests/e2e/helpers/clerk-test-invitation.ts`に、招待作成・Clerkユーザー削除・Supabase会員レコード削除を1箇所にまとめる。各specファイルは`afterEach`でこのヘルパーの`cleanup()`を呼ぶ
- **Rationale**: CLAUDE.mdのテスト運用ルール（作成したデータは必ずクリーンアップする）を6ランク×複数テストで重複実装せずに徹底する。`afterEach`はテストの成否に関わらず実行されるため、失敗時のゴミ残りも防げる
- **Alternatives considered**: 各specファイルに個別に片付け処理を書く → 6ランク分の重複コードになり保守性が低いため却下

## Decision: Clerkプリビルドコンポーネントのロケーター（T001実機確認済み）

- **Decision**: `setupClerkTestingToken({ page })`（ボット対策バイパス。`clerkSetup()`実行後に呼ぶ必要がある）を使った上で、以下のロケーターで実際の画面を操作できることを確認した:
  - 招待URL（`invitation.url`）へ`page.goto()` → `/welcome?__clerk_status=sign_up&__clerk_ticket=...`に遷移
  - `/welcome`: `page.getByRole("heading", { name: "利用規約" })`表示を待ち、`page.getByLabel("利用規約に同意する").check()` → `page.getByRole("button", { name: "同意してアカウントを作成" }).click()`
  - `/sign-up`（ticket付き）: 見出し"Fill in missing fields"。`page.getByLabel("Password", { exact: true }).fill(...)` → `page.getByRole("button", { name: "Continue" }).click()`
  - `/sign-in`: `page.getByLabel("Email address").fill(...)` → Continue → `page.getByLabel("Password", { exact: true }).fill(...)` → Continue
- **Rationale**: 推測ではなく実機確認により確定。Clerkの英語ラベル（"Email address"・"Password"・"Continue"）はアプリの日本語UIとは無関係に固定でこの値になる（Clerkコンポーネントのデフォルトロケール）
- **重要な発見1（確定・spec.mdに反映済み）**: **登録時に確認コード入力画面は表示されない**。招待チケット経由の`/sign-up`では、メールアドレスは招待により既に検証済み扱いとなり、パスワード入力のみで登録が完了し即座に`/onboarding/plan`へ遷移する。これは招待自体がメール所有権の証明として機能するためで、仕様通りの動作
- **重要な発見2（訂正済み。最終結論は下記「訂正」を参照）**: 当初、新規作成したテストユーザー・既存の`E2E_USER_EMAIL`アカウントともに`twoFactorEnabled: false`であり、`/v1/environment`（Frontend API）でも`email_address.used_for_second_factor: false`だったことから、「メール2段階認証は存在しない」と一時結論したが、これは誤りだった（下記参照）

### 訂正（2026-07-20、ユーザーの手動確認により判明）

ログイン時の追加確認コードは、**固定のMFA（`twoFactorEnabled`や`used_for_second_factor`のようなアカウント単位・インスタンス単位の設定）ではなく、Clerkが「そのブラウザ・デバイスがそのアカウントでログインした実績があるか」を見て、未知のデバイスからのログインにのみ追加の確認コードを要求する仕組み（デバイス認識ベースの確認）だった**。

検証方法と結果:

- 通常のブラウザで登録直後に同じブラウザでログイン → 確認コードなし（登録時にそのブラウザ・アカウントの組み合わせが信頼済みとして記録されるため）
- シークレット/プライベートウィンドウ（Cookie共有なしの別ブラウザとして振る舞う）から同じアカウントでログイン → **確認コードが要求される**（ユーザーが実機で確認済み）

T001時点の自動化スクリプトが「確認コードが一度も出ない」という結果になったのは、登録とログインを**同一のPlaywright `page`（同一ブラウザコンテキスト）内で連続して**実行していたため、そのデバイスが登録時点で信頼済みになっていたことが原因。Playwrightの各テストは通常テストごとに独立した`page`/`context`（Cookieなし）を使うため、**正しく実装すれば実際のE2Eテストでは自然にこの確認コードが要求される**。

**実装上の注意（T005実装時に反映すること）**: ログインテスト用のテスト会員を作る際、その「事前準備の登録」と「テスト対象のログイン」を**同一のPlaywright `page`/`context`で行ってはならない**（信頼済みデバイス扱いになり確認コードが再現できなくなる）。事前準備はClerk Backend APIで直接ユーザーを作成する（ブラウザを一切使わない）か、別の`browser.newContext()`で登録を行い、ログインは新しい`context`で行うこと。

- **Alternatives considered**: なし。当初は実装フェーズでの実機確認を予定していたが、T001の中で前倒しで確認した

### ログインフロー・確認コードのロケーター（実機確認済み、2026-07-20）

Zenn記事（`https://zenn.dev/b13o/articles/testing-clerk-playwright`）を参考に、Backend APIでの動的なユーザー作成・削除を毎テストで行う複雑さを避け、**事前に作成した固定のテスト用アカウント（`E2E_USER_EMAIL`/`E2E_USER_PASSWORD`）を使い回す**方針に変更した。これにより`createTestUserDirectly`のような動的作成ヘルパーは不要になり、ログインテストは「新しいブラウザコンテキストから固定アカウントでログインする」だけで済む。

- `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`を`+clerk_test`アドレス＋Backend APIの`users.createUser({ emailAddress, password, skipPasswordChecks: true })`で新規に作り直した（旧アカウント`info+user_test@wknd-studio.com`は削除済み。`.env.local`・`.env.example`・Doppler`dev`/`stg`を更新済み）
- 確認済みロケーター（新しいブラウザコンテキストから）:
  - `/sign-in`: `page.getByLabel("Email address").fill(...)` → `page.getByRole("button", { name: "Continue" }).click()`
  - パスワード入力: `page.getByLabel("Password", { exact: true }).fill(...)` → Continue → `/sign-in/factor-two`へ遷移（見出し"Check your email"、本文"You're signing in from a new device. We're asking for verification to keep your account secure."）
  - 確認コード入力: `page.getByLabel("Enter verification code").fill("424242")` — **入力完了と同時に自動送信される（Continueボタンのクリックは不要、むしろクリックしようとするとボタン参照が外れタイムアウトする）**
  - 成功時: `/onboarding/plan`（未完了）または`/shop`（完了済み）へ遷移
- この一連の流れを新規作成した`E2E_USER_EMAIL`アカウントで実機確認済み（登録→ログアウトなし→新しいPlaywright `browser.newContext()`からログイン→確認コード画面→自動送信→`/onboarding/plan`到達）

## Decision: 既存のticket方式テストは置き換えない

- **Decision**: `tests/e2e/auth/onboarding.spec.ts`は変更せず、新規ファイル（`registration.spec.ts`・`login.spec.ts`）を追加する
- **Rationale**: 既存テストは「ログイン後のオンボーディング画面遷移」を検証する目的で、ログイン過程自体を検証する今回のテストとは目的が異なる。両方に価値があるため共存させる
- **Alternatives considered**: なし（spec.mdのEdge Casesで既に決定済み）

## NEEDS CLARIFICATION（未解決）

- なし。実装時に確認が必要な点（Clerkのロケーター）はtasks.mdの最初のタスクとして明記し、ブロッカーにはしない
