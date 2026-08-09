# 会員登録フロー

> 本ドキュメントは spec 005（法人会員/B2B対応）のPhase 3実装時点（個人セルフサインアップ〜プラン選択〜Stripe決済、および法人セルフサインアップ〜組織作成〜プラン選択〜Stripe決済）の実装を反映している。7ランクモデル（STARTER〜ENTERPRISE）準拠。

## 前提

- **招待制**: 管理者が招待メールを送った人のみ会員登録できる（Clerk Restricted signup mode）
- **個人/法人の選択**: サインアップ完了直後に個人・法人のどちらとして利用するかを選ぶ（`next.config.ts`の`NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`で`/onboarding/account-type`へ強制遷移）
- **個人・法人は排他**: 1ユーザーが個人会員としての会員ランクと法人組織メンバーとしての所属を両方持つことはない（FR-022）
- **決済は個人・法人で共通**: どちらもStripe Checkoutで初期費用・月額費用を決済する。決済完了はStripe Webhook（`checkout.session.completed`）で非同期に確定する
- **Webhookによる非同期処理**: Clerkの`user.created`イベントでSupabaseに仮ユーザーレコードを作成する（ベストエフォート配信のため、各Server Action側でも整合性を保証する）

---

## フロー全体図

```mermaid
flowchart TD
    A["管理者: /admin/invitations"] --> B["招待メール送信"]
    B --> C["ユーザー: 招待リンクをクリック"]
    C --> D["/welcome: 利用規約に同意"]
    D --> E["/sign-up: パスワード設定"]
    E --> F["Clerkがuser.createdを発火\n（Webhookでusersレコードを仮作成）"]
    F --> G["/onboarding/account-type\n個人/法人を選択"]

    G -- 個人として登録 --> H["/onboarding/plan\nプラン選択"]
    H --> I["selectPlan\nusers.rankを仮保存"]
    I --> J["/onboarding/payment\nStripe Checkout"]

    G -- 法人として登録 --> K["/onboarding/organization\n会社情報・インボイス番号を入力"]
    K --> L["createOrganization\n組織作成 + Clerk Organizations API\n作成者をorg:adminで登録"]
    L --> M["/onboarding/plan?organizationId=...\nプラン選択"]
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

## フェーズ1: 招待送信（管理者）

```mermaid
sequenceDiagram
    actor 管理者
    participant Admin as /admin/invitations
    participant API as /api/admin/invitations
    participant Clerk

    管理者->>Admin: メールアドレスを入力して送信
    Admin->>API: POST { emailAddress }
    API->>Clerk: createInvitation({ emailAddress, redirectUrl: "/welcome" })
    Clerk-->>API: 招待レコード
    Clerk-->>ユーザー: 招待メールを送信
    API-->>Admin: 201 Created
```

---

## フェーズ2: 利用規約同意・サインアップ・アカウント種別選択

```mermaid
sequenceDiagram
    actor ユーザー
    participant Welcome as /welcome
    participant Signup as /sign-up
    participant Clerk
    participant AccountType as /onboarding/account-type

    ユーザー->>Welcome: 招待リンクをクリック（__clerk_ticket付き）
    Welcome-->>ユーザー: 利用規約を表示
    ユーザー->>Welcome: 同意して送信
    Welcome-->>ユーザー: /sign-up?__clerk_ticket=xxx へリダイレクト
    ユーザー->>Signup: パスワードを入力して登録
    Signup->>Clerk: サインアップ完了（__clerk_ticketで認証済み）
    Clerk-->>Clerk: user.created イベントを発火
    Clerk-->>ユーザー: NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URLに従い/onboarding/account-typeへ

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

    Clerk->>Webhook: POST user.created
    Webhook->>Webhook: svix署名を検証
    alt 署名が不正
        Webhook-->>Clerk: 400 Bad Request
    else 署名が正常
        Webhook->>DB: usersテーブルにINSERT rank=starter, onboarding_completed=false
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

    ユーザー->>Plan: プランを選択して送信
    Plan->>Action: selectPlan
    Action->>DB: users.rankを保存（onboarding_completed=false）
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

    代表者->>Org: 会社名・代表者名・所在地・電話番号・\nインボイス番号を入力して送信
    Org->>CreateOrg: createOrganization
    CreateOrg->>CreateOrg: インボイス番号の形式検証（T+13桁）
    CreateOrg->>DB: 会社名の重複チェック
    CreateOrg->>DB: usersレコードが無ければ作成\n（Webhook未到達対策）
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

| パス                       | 認証                                        | 説明                                                 |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| `/welcome`                 | 不要（`__clerk_ticket`で招待を検証）        | 利用規約同意ページ                                   |
| `/sign-up`                 | 不要（Restricted modeで招待リンクのみ有効） | Clerkサインアップページ                              |
| `/sign-in`                 | 不要（公開）                                | Clerkサインインページ                                |
| `/onboarding/account-type` | 必要                                        | 個人/法人選択                                        |
| `/onboarding/plan`         | 必要                                        | プラン選択（個人・法人共通、`organizationId`で分岐） |
| `/onboarding/organization` | 必要                                        | 法人情報入力                                         |
| `/onboarding/payment`      | 必要                                        | Stripe Checkoutへのリダイレクト中継                  |
| `/admin/invitations`       | 必要（adminロール）                         | 招待送信ページ                                       |
| `/api/admin/invitations`   | 必要（adminロール）                         | 招待送信API                                          |
| `/api/webhooks/clerk`      | 不要（svix署名で検証）                      | Clerk Webhook受信エンドポイント                      |
| `/api/webhooks/stripe`     | 不要（Stripe署名で検証）                    | Stripe Webhook受信エンドポイント                     |
| `/shop`                    | 必要 + `onboarding_completed=true`          | ショップ本体                                         |

---

## 設計決定事項

| #   | 項目                                 | 決定内容                                                                                                                                                                   |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | アクセス制限                         | ClerkのRestricted signup modeで招待リンク以外のサインアップをブロック                                                                                                      |
| 2   | サインアップ直後の遷移先             | `next.config.ts`の`NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`で`/onboarding/account-type`を指定（Clerk Dashboardの設定ではない）                                        |
| 3   | 個人/法人の判定                      | `organization_memberships`に自分のレコードが1件でもあるかで判定。動的な切り替えは発生しない（FR-022）                                                                      |
| 4   | Webhookと Server Action の二重upsert | Webhookはベストエフォート配信のため、`selectPlan`・`createOrganization`でも`users`をupsert/作成して整合性を保証                                                            |
| 5   | onboarding_completedフラグ           | 個人・法人ともにStripe決済完了（`checkout.session.completed`）まで`false`のまま。決済前にrankだけ仮保存し、確定はWebhook側で行う                                           |
| 6   | 法人のStripe決済                     | 個人会員と同じくCheckout Sessionで初期費用・月額費用を決済する。`organizations`テーブルに`stripe_customer_id`/`stripe_subscription_id`を保持                               |
| 7   | 法人登録時のusersレコード未作成対策  | 法人登録は個人の`selectPlan`を経由しないため、`user.created`Webhook到達前に`createOrganization`が呼ばれる可能性がある。その場でusersレコードを作成するフォールバックを持つ |
| 8   | Webhook冪等性                        | `completeSubscriptionOnboarding`・`completeOrganizationSubscriptionOnboarding`はいずれも、既に`onboarding_completed=true`なら早期returnし再配信に対して冪等                |
