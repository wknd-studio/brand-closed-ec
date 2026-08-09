# 会員登録フロー

> 本ドキュメントは spec 005（法人会員/B2B対応）のPhase 4実装時点（個人セルフサインアップ〜プラン選択（氏名・電話番号入力含む）〜Stripe決済、および法人セルフサインアップ〜組織作成（代表者の氏名・電話番号入力含む）〜プラン選択〜Stripe決済）の実装を反映している。7ランクモデル（STARTER〜ENTERPRISE）準拠。

## 前提

- **Waitlist制**: ユーザーが`/waitlist`で参加希望を送信し、管理者が`/admin/waitlist`で承認した人のみ会員登録できる（Clerk Waitlist signup mode）。旧「管理者が直接メールアドレスを指定して招待する」方式（Restricted signup mode + `/admin/invitations`）は廃止した
- **利用規約・プライバシーポリシーの同意**: 独自ページは持たず、Clerk標準のLegal Consent機能（`compliance.legal_consent`、サインアップフォーム内蔵のチェックボックス）で必須化している。同意先URLは`/legal/terms`・`/legal/privacy`
- **個人/法人の選択**: サインアップ完了直後に個人・法人のどちらとして利用するかを選ぶ（`next.config.ts`の`NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`で`/onboarding/account-type`へ強制遷移）
- **個人・法人は排他**: 1ユーザーが個人会員としての会員ランクと法人組織メンバーとしての所属を両方持つことはない（FR-022）
- **決済は個人・法人で共通**: どちらもStripe Checkoutで初期費用・月額費用を決済する。決済完了はStripe Webhook（`checkout.session.completed`）で非同期に確定する
- **Webhookによる非同期処理**: Clerkの`user.created`イベントでSupabaseに仮ユーザーレコードを作成する（ベストエフォート配信のため、各Server Action側でも整合性を保証する）。同イベントの`legal_accepted_at`を`users.terms_agreed_at`にそのまま転記する
- **氏名・電話番号の必須化**: 個人は`/onboarding/plan`、法人代表者は`/onboarding/organization`で、それぞれのオンボーディング画面内で収集する。既存会員への遡及対応（本番未リリースのため対象ユーザーなし）は本リリースのスコープ外（詳細は`specs/005-b2b-organization/spec.md`のFR-020参照）

---

## フロー全体図

```mermaid
flowchart TD
    A0["ユーザー: /waitlist で参加希望を送信"] --> A["管理者: /admin/waitlist で承認"]
    A --> B["招待メール送信"]
    B --> C["ユーザー: 招待リンクをクリック"]
    C --> E["Clerkホスト型ページ or /sign-up: 利用規約・\nプライバシーポリシーに同意（Clerk標準チェックボックス）\nしてパスワード設定"]
    E --> F["Clerkがuser.createdを発火\n（Webhookでusersレコードを仮作成、legal_accepted_atを転記）"]
    F --> G["/onboarding/account-type\n個人/法人を選択"]

    G -- 個人として登録 --> H["/onboarding/plan\nプラン選択 + 姓・名・電話番号を入力"]
    H --> I["selectPlan\nusers.rank・firstName・lastName・\nphoneNumberを保存"]
    I --> J["/onboarding/payment\nStripe Checkout"]

    G -- 法人として登録 --> K["/onboarding/organization\n会社名・代表者名（姓・名）・所在地\n（郵便番号自動補完）・電話番号・\nインボイス番号を入力"]
    K --> L["createOrganization\n組織作成 + Clerk Organizations API\n作成者をorg:adminで登録\n代表者の姓・名・電話番号を\nusers側にも反映"]
    L --> M["/onboarding/plan?organizationId=...\nプラン選択（氏名・電話番号欄は非表示）"]
    M --> N["selectPlan（組織版）\norganizations.rankを仮保存"]
    N --> O["/onboarding/payment?organizationId=...\nStripe Checkout"]

    J --> P["Stripe Checkout画面で決済"]
    O --> P
    P --> Q{"決済完了"}
    Q -- 成功 --> R["Webhook: checkout.session.completed"]
    Q -- キャンセル --> S["/onboarding/payment/cancel\nプラン選択に戻る"]

    R --> T{"metadataにorganization_idがあるか"}
    T -- なし（個人） --> U["completeSubscriptionOnboarding\nusers.onboarding_completed=true"]
    T -- あり（法人） --> V["completeOrganizationSubscriptionOnboarding\norganizations.onboarding_completed=true\n代表者のusers.onboarding_completed=true"]

    U --> W["/shop へアクセス可能に"]
    V --> W
```

---

## フェーズ1: 参加希望送信・管理者承認

```mermaid
sequenceDiagram
    actor ユーザー
    actor 管理者
    participant Public as /waitlist
    participant Admin as /admin/waitlist
    participant API as /api/admin/waitlist
    participant Clerk

    ユーザー->>Public: メールアドレスを入力して送信\n（Clerk標準<Waitlist />コンポーネント）
    Public->>Clerk: waitlistEntry作成（status: pending）

    管理者->>Admin: 承認待ち一覧を確認
    Admin->>API: GET
    API->>Clerk: waitlistEntries.list({ status: "pending" })
    Clerk-->>API: 一覧
    API-->>Admin: 200 OK

    管理者->>Admin: 「承認」を押す
    Admin->>API: POST { waitlistEntryId }
    API->>Clerk: waitlistEntries.invite(waitlistEntryId)
    Clerk-->>API: waitlistEntry（status: invited）
    Clerk-->>ユーザー: 招待メールを送信
    API-->>Admin: 200 OK
```

> **Note:** `waitlistEntries.invite()`は`createInvitation()`と異なり`redirectUrl`を指定できない（Clerk Backend APIの仕様上のパラメータが存在しない）。そのため招待リンクは必ずClerkのホスト型ページ（Account Portal）を一度経由してから自社アプリへ戻ってくる。実際の登録完了・`/onboarding/account-type`への到達は手動確認済み。

---

## フェーズ2: サインアップ・アカウント種別選択

```mermaid
sequenceDiagram
    actor ユーザー
    participant Hosted as Clerkホスト型ページ（accounts.dev）
    participant Clerk
    participant AccountType as /onboarding/account-type

    ユーザー->>Hosted: 招待リンクをクリック
    Hosted-->>ユーザー: パスワード入力欄と\nLegal Consentチェックボックスを表示\n（/legal/terms・/legal/privacyへのリンク付き）
    ユーザー->>Hosted: パスワードを入力し、同意にチェックして送信
    Hosted->>Clerk: サインアップ完了（legal_accepted_atを記録）
    Clerk-->>Clerk: user.created イベントを発火\n（ブラウザがどのドメインにいるかに関わらずサーバー間で発火）
    Clerk-->>ユーザー: 自社アプリへ復帰しNEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URLに\n従い/onboarding/account-typeへ

    ユーザー->>AccountType: 個人/法人を選択して送信
    alt 個人として登録
        AccountType-->>ユーザー: /onboarding/plan へ
    else 法人として登録
        AccountType-->>ユーザー: /onboarding/organization へ
    end
```

---

## フェーズ3: Webhook処理（Clerk user.created、非同期）

```mermaid
sequenceDiagram
    participant Clerk
    participant Webhook as /api/webhooks/clerk
    participant DB as Supabase

    Clerk->>Webhook: POST user.created（legal_accepted_at含む）
    Webhook->>Webhook: svix署名を検証
    alt 署名が不正
        Webhook-->>Clerk: 400 Bad Request
    else 署名が正常
        Webhook->>DB: usersテーブルにINSERT rank=starter, onboarding_completed=false,\nterms_agreed_at=legal_accepted_at
        Webhook-->>Clerk: 200 OK
    end
```

> **Note:** Webhookはベストエフォート配信のため、`selectPlan`・`createOrganization`側でも`users`が存在しなければその場で作成することで整合性を保証している（法人登録はWebhook到達前にusersレコードへアクセスし得るため、特に重要）。

---

## フェーズ4a: 個人 — プラン選択・決済

```mermaid
sequenceDiagram
    actor ユーザー
    participant Plan as /onboarding/plan
    participant Action as selectPlan
    participant Payment as /onboarding/payment
    participant Stripe
    participant Webhook as /api/webhooks/stripe
    participant DB as Supabase

    ユーザー->>Plan: 姓・名・電話番号を入力し、\nプランを選択して送信
    Plan->>Action: selectPlan（firstName/lastName/phoneNumber含む）
    Action->>Action: PhoneNumber値オブジェクトで\n電話番号の形式を検証
    Action->>DB: users.rank・firstName・lastName・\nphoneNumberを保存（onboarding_completed=false）
    Action-->>ユーザー: /onboarding/payment?plan=xxx へ

    ユーザー->>Payment: ページを開く
    Payment->>Stripe: Checkout Session作成\nmetadata: { clerk_user_id, plan }
    Payment-->>ユーザー: Stripe Checkout画面へリダイレクト
    ユーザー->>Stripe: 決済情報を入力
    Stripe-->>ユーザー: /onboarding/payment/success へ

    Stripe->>Webhook: checkout.session.completed
    Webhook->>Webhook: completeSubscriptionOnboarding
    Webhook->>DB: users.stripe_customer_id, stripe_subscription_id, onboarding_completed=true
    Webhook-->>Stripe: 200 OK
```

---

## フェーズ4b: 法人 — 組織作成・プラン選択・決済

```mermaid
sequenceDiagram
    actor 代表者
    participant Org as /onboarding/organization
    participant CreateOrg as createOrganization
    participant Clerk
    participant Plan as /onboarding/plan
    participant Action as selectPlan（組織版）
    participant Payment as /onboarding/payment
    participant Stripe
    participant Webhook as /api/webhooks/stripe
    participant DB as Supabase

    代表者->>Org: 会社名・代表者名（姓・名）・所在地\n（郵便番号入力でzipcloud APIから自動補完）・\n電話番号・インボイス番号を入力して送信
    Org->>CreateOrg: createOrganization
    CreateOrg->>CreateOrg: インボイス番号の形式検証（T+13桁）\nPhoneNumber値オブジェクトで電話番号を検証
    CreateOrg->>DB: 会社名の重複チェック
    CreateOrg->>DB: usersレコードが無ければ作成、\nあれば代表者の姓・名・電話番号で更新\n（本人のプロフィールとして反映、二重入力を回避）
    CreateOrg->>Clerk: 組織作成API
    CreateOrg->>DB: organizations作成\norganization_membershipsに\norg:adminとして登録
    CreateOrg-->>代表者: /onboarding/plan?organizationId=xxx へ

    代表者->>Plan: プランを選択して送信
    Plan->>Action: selectPlan（organizationId指定）
    Action->>DB: organizations.rankを保存（onboarding_completed=false）
    Action-->>代表者: /onboarding/payment?plan=xxx&organizationId=yyy へ

    代表者->>Payment: ページを開く
    Payment->>Stripe: Checkout Session作成\nmetadata: { clerk_user_id, plan, organization_id }
    Payment-->>代表者: Stripe Checkout画面へリダイレクト
    代表者->>Stripe: 決済情報を入力
    Stripe-->>代表者: /onboarding/payment/success へ

    Stripe->>Webhook: checkout.session.completed
    Webhook->>Webhook: completeOrganizationSubscriptionOnboarding
    Webhook->>DB: organizations.stripe_customer_id, stripe_subscription_id,\norganizations.onboarding_completed=true
    Webhook->>DB: 代表者のusers.onboarding_completed=true
    Webhook-->>Stripe: 200 OK
```

以降、組織に所属する一般担当者は個人としての会員ランク・月次上限を持たず、組織のランク・月次上限を共有する（`resolveMemberContext`経由、FR-022/FR-024）。

---

## ルーティングと公開範囲

| パス                       | 認証                                      | 説明                                                         |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `/legal/terms`             | 不要（公開）                              | 利用規約（Clerk Legal Consentの同意先URL）                   |
| `/legal/privacy`           | 不要（公開）                              | プライバシーポリシー（同上）                                 |
| `/sign-up`                 | 不要（Waitlist modeで招待リンクのみ有効） | Clerkサインアップページ（Legal Consentチェックボックス内蔵） |
| `/sign-in`                 | 不要（公開）                              | Clerkサインインページ                                        |
| `/waitlist`                | 不要（公開）                              | Waitlist参加希望送信ページ（`<Waitlist />`）                 |
| `/onboarding/account-type` | 必要                                      | 個人/法人選択                                                |
| `/onboarding/plan`         | 必要                                      | プラン選択（個人・法人共通、`organizationId`で分岐）         |
| `/onboarding/organization` | 必要                                      | 法人情報入力                                                 |
| `/onboarding/payment`      | 必要                                      | Stripe Checkoutへのリダイレクト中継                          |
| `/admin/waitlist`          | 必要（adminロール）                       | Waitlist承認・却下ページ                                     |
| `/api/admin/waitlist`      | 必要（adminロール）                       | Waitlist一覧・承認・却下API                                  |
| `/api/webhooks/clerk`      | 不要（svix署名で検証）                    | Clerk Webhook受信エンドポイント                              |
| `/api/webhooks/stripe`     | 不要（Stripe署名で検証）                  | Stripe Webhook受信エンドポイント                             |
| `/shop`                    | 必要 + `onboarding_completed=true`        | ショップ本体                                                 |

---

## 設計決定事項

| #   | 項目                                    | 決定内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | アクセス制限                            | ClerkのWaitlist signup modeで、`/waitlist`から参加希望を送信し管理者が承認した人のみサインアップ可能にする。旧「管理者が直接メールアドレスを指定して招待する」方式（`/admin/invitations`）は廃止した                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | サインアップ直後の遷移先                | `next.config.ts`の`NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`で`/onboarding/account-type`を指定（Clerk Dashboardの設定ではない）                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | 個人/法人の判定                         | `organization_memberships`に自分のレコードが1件でもあるかで判定。動的な切り替えは発生しない（FR-022）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | Webhookと Server Action の二重upsert    | Webhookはベストエフォート配信のため、`selectPlan`・`createOrganization`でも`users`をupsert/作成して整合性を保証                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5   | onboarding_completedフラグ              | 個人・法人ともにStripe決済完了（`checkout.session.completed`）まで`false`のまま。決済前にrankだけ仮保存し、確定はWebhook側で行う                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | 法人のStripe決済                        | 個人会員と同じくCheckout Sessionで初期費用・月額費用を決済する。`organizations`テーブルに`stripe_customer_id`/`stripe_subscription_id`を保持                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | 法人登録時のusersレコード未作成対策     | 法人登録は個人の`selectPlan`を経由しないため、`user.created`Webhook到達前に`createOrganization`が呼ばれる可能性がある。その場でusersレコードを作成するフォールバックを持つ                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | Webhook冪等性                           | `completeSubscriptionOnboarding`・`completeOrganizationSubscriptionOnboarding`はいずれも、既に`onboarding_completed=true`なら早期returnし再配信に対して冪等                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | 利用規約同意の実装                      | 独自の`/welcome`ページは廃止し、Clerk標準のLegal Consent機能（`compliance.legal_consent`、`clerk config patch`で設定）に一本化。同意日時はClerkの`legal_accepted_at`をuser.createdウェブフックで`users.terms_agreed_at`へ転記する（`selectPlan`側では上書きしない）                                                                                                                                                                                                                                                                                                                                |
| 10  | 氏名・電話番号の収集場所                | 汎用のプロフィール入力ゲート（`/profile/complete`+`middleware.ts`リダイレクト）は作らず、各オンボーディング画面内で完結させる。個人は`/onboarding/plan`に入力欄を追加。法人代表者は`/onboarding/organization`の代表者名を姓・名に分割し、その値と電話番号をそのまま本人の`users.first_name`/`last_name`/`phone_number`にも反映する（`create-organization.ts`）ため、別画面での二重入力が発生しない                                                                                                                                                                                                 |
| 11  | 電話番号のバリデーション                | `PhoneNumber`値オブジェクト（0始まりの10〜11桁、ハイフンは正規化）で個人・法人共通で検証する。不正な形式は`InvalidPhoneNumberError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 12  | Restricted mode → Waitlist modeへの移行 | 管理者が能動的に招待する方式から、ユーザーが自発的に参加希望を送信し管理者が承認する方式へ変更（`docs/waitlist-migration-plan.md`）。`clerk.invitations.createInvitation()`はWaitlist mode有効化後も引き続き機能するため、E2Eテストヘルパー（`tests/e2e/helpers/clerk-test-invitation.ts`）は変更不要                                                                                                                                                                                                                                                                                              |
| 13  | Waitlist招待のredirectUrl制約           | `waitlistEntries.invite()`はBackend API仕様上`redirectUrl`を指定できない（`createInvitation()`との違い）。そのため招待リンクは必ずClerkのホスト型ページ（Account Portal）を一度経由してから自社アプリに戻る。E2Eテスト（`tests/e2e/auth/waitlist.spec.ts`）は参加希望送信〜管理者承認による招待URL発行までを検証し、ホスト型ページ経由のサインアップ完了以降は`registration.spec.ts`等の既存E2E（`createInvitation`経由・自社`/sign-up`ページ）で間接的にカバーする。理由は、Clerkのボット対策バイパス機構（`setupClerkTestingToken`）がホスト型ページへの遷移と相性が悪く自動操作が安定しないため |
