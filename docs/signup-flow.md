# 会員登録フロー

> ⚠️ **現状の実装について**: 本ドキュメントの「Free プラン」分岐は現在のコード実装と一致している。`service-spec.md` は7ランクモデル（STARTER〜ENTERPRISE、Free ランクなし）に更新済みだが、コード側の移行は未着手（[BRAND-97](https://linear.app/wknd-studio/issue/BRAND-97)）。移行完了後に本ドキュメントも更新すること。

## 前提

- **招待制**: 管理者が招待メールを送った人のみ会員登録できる
- **Clerk Restricted signup mode**: 招待リンク経由以外のサインアップをブロック
- **3フェーズ構成**: 利用規約同意 → Clerk アカウント作成 → オンボーディング（プラン選択）
- **Webhook による非同期処理**: Clerk の `user.created` イベントを受け取って Supabase にユーザーレコードを作成する

---

## フロー全体図

```mermaid
flowchart TD
    A["管理者: /admin/invitations"] --> B["メールアドレスを入力して招待送信"]
    B --> C["Clerk: createInvitation()\nredirectUrl=/welcome\n招待メールを送信"]
    C --> D["ユーザー: メールのリンクをクリック"]
    D --> E["/welcome?__clerk_ticket=xxx\n利用規約を表示"]
    E --> F{"利用規約に同意する"}
    F -- 同意しない --> E
    F -- 同意する --> G["/sign-up?__clerk_ticket=xxx へリダイレクト"]
    G --> H["Clerk がアカウントを作成\nメール認証済み（__clerk_ticket で保証）"]
    H --> I["Clerk が user.created を発火"]
    I --> J["Webhook 処理\nSupabase に仮ユーザーレコードを作成"]
    H --> K["middleware がオンボーディング未完了を検出"]
    K --> L["/onboarding/plan へリダイレクト"]
    L --> M["プランを選択\nfree / entry / standard / pro"]
    M --> N["selectPlan Server Action"]
    N --> O["Supabase: users を upsert\nrank, terms_agreed_at, terms_version, onboarding_completed"]
    O --> P["Clerk publicMetadata を更新\nonboarding_completed を更新"]
    P --> Q{"プランは free か？"}
    Q -- はい --> R["/shop へリダイレクト\n登録完了"]
    Q -- いいえ --> S["/onboarding/payment へリダイレクト\n決済情報登録 フェーズ2"]
```

---

## フェーズ 1: 招待送信（管理者）

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

## フェーズ 2: 利用規約同意 & サインアップ

```mermaid
sequenceDiagram
    actor ユーザー
    participant Welcome as /welcome
    participant Signup as /sign-up
    participant Clerk

    ユーザー->>Welcome: メールの招待リンクをクリック（__clerk_ticket 付き）
    Welcome-->>ユーザー: 利用規約を表示
    ユーザー->>Welcome: チェックボックスに同意して送信
    Welcome-->>ユーザー: /sign-up?__clerk_ticket=xxx へリダイレクト
    ユーザー->>Signup: パスワードを入力して登録
    Signup->>Clerk: サインアップリクエスト（__clerk_ticket で認証済み）
    Clerk-->>ユーザー: 認証完了・セッション発行
    Clerk-->>Clerk: user.created イベントを発火
```

---

## フェーズ 3: Webhook 処理（非同期）

```mermaid
sequenceDiagram
    participant Clerk
    participant Webhook as /api/webhooks/clerk
    participant DB as Supabase

    Clerk->>Webhook: POST user.created
    Webhook->>Webhook: svix 署名を検証
    alt 署名が不正
        Webhook-->>Clerk: 400 Bad Request
    else 署名が正常
        Webhook->>DB: users テーブルに INSERT rank=free, onboarding_completed=false
        Webhook-->>Clerk: 200 OK
    end
```

> **Note:** Webhook はベストエフォート配信のため、`selectPlan` でも `users` を upsert することで整合性を保証している。

---

## フェーズ 4: オンボーディング（プラン選択）

```mermaid
sequenceDiagram
    actor ユーザー
    participant MW as middleware
    participant Onboarding as /onboarding/plan
    participant Action as selectPlan
    participant DB as Supabase
    participant Clerk

    ユーザー->>MW: 認証済みページへアクセス
    MW->>MW: sessionClaims.metadata.onboarding_completed を確認
    MW-->>ユーザー: /onboarding/plan へリダイレクト

    ユーザー->>Onboarding: ページを開く
    Onboarding-->>ユーザー: プラン選択 UI を表示
    ユーザー->>Onboarding: プランを選択して送信
    Onboarding->>Action: selectPlan
    Action->>DB: users を upsert rank, terms_agreed_at=now(), terms_version, onboarding_completed
    Action->>Clerk: publicMetadata 更新 onboarding_completed=true または false
    alt Free プラン
        Action-->>ユーザー: /shop へリダイレクト（登録完了）
    else 有料プラン
        Action-->>ユーザー: /onboarding/payment へリダイレクト（フェーズ2）
    end
```

---

## ルーティングと公開範囲

| パス                     | 認証                                         | 説明                             |
| ------------------------ | -------------------------------------------- | -------------------------------- |
| `/welcome`               | 不要（`__clerk_ticket` で招待を検証）        | 利用規約同意ページ               |
| `/sign-up`               | 不要（Restricted mode で招待リンクのみ有効） | Clerk サインアップページ         |
| `/sign-in`               | 不要（公開）                                 | Clerk サインインページ           |
| `/onboarding/plan`       | 必要                                         | プラン選択                       |
| `/admin/invitations`     | 必要（admin ロール）                         | 招待送信ページ                   |
| `/api/admin/invitations` | 必要（admin ロール）                         | 招待送信 API                     |
| `/api/webhooks/clerk`    | 不要（svix 署名で検証）                      | Clerk Webhook 受信エンドポイント |
| `/shop`                  | 必要 + onboarding_completed=true             | ショップ本体                     |

---

## 設計決定事項

| #   | 項目                                   | 決定内容                                                                                                                                                                                                |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | アクセス制限                           | Clerk の Restricted signup mode で招待リンク以外のサインアップをブロック                                                                                                                                |
| 2   | 利用規約同意のタイミング               | サインアップ前（`/welcome`）で同意を取得。同意日時を URL パラメータで `/sign-up` へ渡し、オンボーディング完了時に DB へ記録                                                                             |
| 3   | terms_agreed_at の記録タイミング       | `/welcome` でユーザーが同意し、`selectPlan` 実行時刻を `terms_agreed_at` として DB に記録。Restricted mode により招待フロー（`/welcome`）を経由しないサインアップはブロックされるため整合性を保証できる |
| 4   | Webhook と Server Action の二重 upsert | Webhook はベストエフォート配信のため、`selectPlan` でも `users` を upsert して整合性を保証                                                                                                              |
| 5   | onboarding_completed フラグ            | Clerk の `publicMetadata` に保持し middleware で参照。free プランは即 `true`、有料プランは決済完了後に `true`（フェーズ2）                                                                              |
| 6   | 有料プランの決済                       | `/onboarding/payment` での Stripe 決済フローはフェーズ2で実装                                                                                                                                           |
