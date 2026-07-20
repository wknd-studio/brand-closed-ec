# Phase 0 Research: 会員登録・ログインフローのE2Eテスト網羅

## Decision: 招待リンクはClerk公式APIの`url`フィールドを直接使う

- **Decision**: `clerkClient.invitations.createInvitation({ emailAddress, redirectUrl, ignoreExisting: true })`を呼び、レスポンスの`url`フィールド（`@clerk/backend`の`Invitation`型で`readonly url?: string`と定義されている、実際のメールに記載されるURLそのもの）へ`page.goto()`する
- **Rationale**: 管理画面（`src/app/api/admin/invitations/route.ts`）が使っているAPIと完全に同一であり、実際のメール受信・クリックを模擬できる。メールを読む仕組み（Mailpit等）を別途用意する必要がない
- **Alternatives considered**: Mailpit（ローカルSupabaseに付随するメールキャッチャー、`docs/cicd.md`に記載あり）からメール本文をパースしてリンクを抽出する方式 → Clerkの招待メールはSupabase Mailpitを経由しない（Clerk自身が送信するため）ため、そもそも使えない

## Decision: テストユーザーのクリーンアップは共通ヘルパーに集約する

- **Decision**: `tests/e2e/helpers/clerk-test-invitation.ts`に、招待作成・Clerkユーザー削除・Supabase会員レコード削除を1箇所にまとめる。各specファイルは`afterEach`でこのヘルパーの`cleanup()`を呼ぶ
- **Rationale**: CLAUDE.mdのテスト運用ルール（作成したデータは必ずクリーンアップする）を6ランク×複数テストで重複実装せずに徹底する。`afterEach`はテストの成否に関わらず実行されるため、失敗時のゴミ残りも防げる
- **Alternatives considered**: 各specファイルに個別に片付け処理を書く → 6ランク分の重複コードになり保守性が低いため却下

## Decision: Clerkプリビルドコンポーネントのロケーターは実装時に確定する

- **Decision**: `<SignIn />`/`<SignUp />`はClerk側が完全にレンダリングするコンポーネントで、DOM構造は本リポジトリのコードには存在しない。具体的なPlaywrightロケーター（ラベルテキスト・role等）は、実装フェーズで実際にブラウザを開いて確認してから確定する
- **Rationale**: 現時点でロケーターを推測で書くと実装時に大きくやり直しになるリスクが高い。Clerkは通常アクセシブルなラベル（"Email address"・"Password"・"Continue"等）を持つため、`getByLabel()`/`getByRole()`で概ね対応できる見込みだが確証はない
- **Alternatives considered**: なし。この点はresearch.mdでの調査事項として明記し、tasks.mdの最初のタスクで実機確認することにする

## Decision: 既存のticket方式テストは置き換えない

- **Decision**: `tests/e2e/auth/onboarding.spec.ts`は変更せず、新規ファイル（`registration.spec.ts`・`login.spec.ts`）を追加する
- **Rationale**: 既存テストは「ログイン後のオンボーディング画面遷移」を検証する目的で、ログイン過程自体を検証する今回のテストとは目的が異なる。両方に価値があるため共存させる
- **Alternatives considered**: なし（spec.mdのEdge Casesで既に決定済み）

## NEEDS CLARIFICATION（未解決）

- なし。実装時に確認が必要な点（Clerkのロケーター）はtasks.mdの最初のタスクとして明記し、ブロッカーにはしない
