# Data Model: 法人会員（B2B）対応

## Organization（新設）

法人会員を表す集約ルート。`docs/domain-model.md` の `User` 集約と対称的な責務（ランク管理・月次期間算出）を組織単位で持つ。

| フィールド                        | 型                                 | 説明                                                                                                 |
| --------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                              | UUID                               | 主キー                                                                                               |
| `clerk_org_id`                    | TEXT UNIQUE                        | Clerk Organization ID                                                                                |
| `name`                            | TEXT NOT NULL                      | 法人名                                                                                               |
| `representative_name`             | TEXT NOT NULL                      | 代表者名                                                                                             |
| `phone_number`                    | TEXT NOT NULL                      | 電話番号                                                                                             |
| `postal_code`                     | TEXT NOT NULL                      | 本店所在地・郵便番号                                                                                 |
| `prefecture`                      | TEXT NOT NULL                      | 本店所在地・都道府県                                                                                 |
| `city`                            | TEXT NOT NULL                      | 本店所在地・市区町村                                                                                 |
| `address_line1`                   | TEXT NOT NULL                      | 本店所在地・番地                                                                                     |
| `address_line2`                   | TEXT \| null                       | 本店所在地・建物名等                                                                                 |
| `invoice_registration_number`     | TEXT NOT NULL, CHECK (`^T\d{13}$`) | 適格請求書発行事業者登録番号（FR-021）                                                               |
| `onboarding_completed`            | BOOLEAN NOT NULL DEFAULT false     | ランク選択が完了したか。`users.onboarding_completed`と対称（組織作成とランク選択は別ステップのため） |
| `rank`                            | MemberRank (既存ENUM再利用)        | 組織の会員ランク                                                                                     |
| `billing_anchor_day`              | SMALLINT (1-28)                    | 月次期間の起点日（`docs/plan-change-flow.md`と同じ考え方）                                           |
| `pending_rank`                    | MemberRank \| null                 | ダウングレード予約中のランク                                                                         |
| `stripe_customer_id`              | TEXT                               | Stripe顧客ID（組織単位）                                                                             |
| `stripe_subscription_id`          | TEXT                               | Stripeサブスクリプション ID                                                                          |
| `stripe_subscription_schedule_id` | TEXT \| null                       | ダウングレード予約中のみ                                                                             |
| `initial_fee_paid_rank`           | MemberRank \| null                 | 初期費用支払い済みの最高ランク                                                                       |
| `deleted_at`                      | TIMESTAMPTZ \| null                | 組織クローズ日時（唯一の管理者退会時等）                                                             |
| `created_at`                      | TIMESTAMPTZ                        |                                                                                                      |

本店所在地は組織に1件だけ存在する公式情報のため、`addresses`テーブル（配送先・請求先の複数登録を前提とした設計）ではなく`organizations`に直接カラムとして持つ（住所の型自体は`addresses`の郵便番号等のカラムと揃える）。

**振る舞い**（`Organization` エンティティが答えられる問い）:

- `getMonthlyPeriod()` / `getMonthlyLimit()`: `User` と同じ責務を組織スコープで提供
- `isClosed()`: `deleted_at` の有無で判定

---

## OrganizationMembership（新設）

`User` と `Organization` の多対多を表す中間テーブル。ClerkのOrganizationMembershipをwebhookでミラーリングする（R2, R5参照）。

| フィールド        | 型                                 | 説明   |
| ----------------- | ---------------------------------- | ------ |
| `id`              | UUID                               | 主キー |
| `organization_id` | UUID FK → organizations.id         |        |
| `user_id`         | UUID FK → users.id                 |        |
| `clerk_role`      | TEXT ('org:admin' \| 'org:member') |        |
| `created_at`      | TIMESTAMPTZ                        |        |

**制約**:

- `(organization_id, user_id)` UNIQUE — 同じユーザーが同じ組織に二重所属しない
- 1ユーザーが複数組織に所属することは許可（`organization_id`側はUNIQUEにしない）

**不変条件**（FR-017に対応）:

- ある `organization_id` に対して `clerk_role = 'org:admin'` のレコードが最低1件存在する限り、既存の `org:admin` の削除・降格は許可されるが、それがゼロになる操作は禁止される。ゼロになるのは「組織クローズ（`organizations.deleted_at` セット）と同時に全メンバーシップを削除する」場合のみ。

---

## Order（拡張）

既存の `orders` テーブルに以下を追加する。既存カラムはそのまま維持し、個人会員の挙動を変えない（FR-013）。

| 追加フィールド         | 型                                                                           | 説明                                     |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `organization_id`      | UUID FK → organizations.id, nullable                                         | 法人注文の場合のみセット。個人注文はnull |
| `requested_by_user_id` | UUID FK → users.id, nullable                                                 | 発注した担当者（組織注文の場合のみ）     |
| `approval_status`      | TEXT ('auto_approved'\|'pending_approval'\|'approved'\|'rejected'), nullable | 個人注文はnull。組織注文は必須           |
| `approved_by_user_id`  | UUID FK → users.id, nullable                                                 | 承認/却下した管理者                      |
| `approved_at`          | TIMESTAMPTZ, nullable                                                        |                                          |

**status（既存ENUM）への追加値**: `pending_approval`（R4参照）。承認により既存の `pending_payment` / `confirming` に遷移する。

**状態遷移（追加分）**:

```
[org:memberが発注]      → status=pending_approval, approval_status=pending_approval
[org:adminが発注]        → status=pending_payment/confirming（既存フローへ直行）, approval_status=auto_approved
[org:adminが承認]        → pending_approval → pending_payment/confirming, approval_status=approved
                            （承認直前に requested_by_user_id がまだ organization_memberships に
                              存在することを再検証する。FR-018）
[org:adminが却下]        → pending_approval → cancelled, approval_status=rejected
[メンバー除外による自動却下] → pending_approval → cancelled, approval_status=rejected
```

**月次上限集計への算入ルール（FR-016）**: `approval_status IN ('auto_approved', 'pending_approval', 'approved')` の注文金額を組織の月次使用金額として合算する。`rejected` は自動的に除外される（都度再集計するため、能動的な「解放」処理は不要。R4・既存`MonthlyLimitService`のパターンを継承）。

---

## Address（拡張）

既存の `addresses` テーブルに以下を追加する。

| 追加フィールド    | 型                                   | 説明                                             |
| ----------------- | ------------------------------------ | ------------------------------------------------ |
| `organization_id` | UUID FK → organizations.id, nullable | 組織の共有住所帳の場合のみセット。個人住所はnull |

`user_id` は引き続きNOT NULLのまま維持し、「誰が登録した住所か」の記録として残す（組織住所でも登録者は特定の担当者）。表示・選択時のスコープ判定は `organization_id` の有無で行う。

---

## User（拡張）

個人会員としての利用と法人組織メンバーとしての利用は排他的（FR-022）。あるユーザーが1件以上の`OrganizationMembership`を持つ場合、そのユーザーの`rank` / `stripe_*` / `billing_anchor_day`等（個人会員としての購入機能一式）はアプリケーションのどの処理からも参照されない。個人・法人の判定は「`organization_memberships`に自分のレコードが1件でもあるか」で行い、コンテキストの動的な切り替え（個人⇄組織）は発生しない（切り替えが必要なのは、複数組織に所属する場合の「どの組織か」のみ）。

**参照経路の一元化（FR-024, R11）**: `users.rank`は`NOT NULL`制約のため、法人組織のみに所属するユーザーでも常に既定値（現行`'starter'`）が物理的に入っている。既存コードには`user.rank`を直接参照する箇所が複数存在するため（商品カタログ閲覧制御・チェックアウト・月次上限計算等）、本機能ではこれらを新設の解決関数経由に置き換える。個人会員はこれまで通り`users.rank`の値がそのまま返るため挙動は変わらない。

| 追加フィールド         | 型                       | 説明                                                                                 |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `phone_number`         | TEXT NOT NULL DEFAULT '' | アカウントレベルの連絡先電話番号。`addresses.phone_number`（配送先ごと）とは別の概念 |
| `profile_completed_at` | TIMESTAMPTZ \| null      | 氏名・電話番号の入力が完了した日時。既存会員の遡及対応（FR-020）の判定に使う         |

既存の `first_name` / `last_name` は引き続き利用し、空文字をデフォルトのまま許容する制約は撤廃しない（DB制約でNOT NULLにはしない。理由: 既存の空文字レコードとの互換性を保ちつつ、アプリケーション層のゲートチェックで「未入力」を判定するほうが、既存会員への一斉マイグレーションを避けられ安全なため）。

**既存不備の是正（R9）**: DBカラムは存在するが、`src/domain/entities/user.ts` の `User` エンティティには `firstName` / `lastName` フィールドが定義されておらず、`select-plan.ts` が受け取った値も永続化されずに握りつぶされている。本機能でエンティティに `firstName` / `lastName` / `phoneNumber` を追加し、`UserRepository` 実装のマッピングも合わせて修正する（UI入力だけでは解決しない、ドメイン層〜インフラ層を貫通する修正が必要）。

**プロフィール完了ゲート**（FR-019, FR-020）: `first_name` / `last_name` / `phone_number` のいずれかが空文字の場合、既存の `middleware.ts` のオンボーディング未完了リダイレクトと同じパターンで、`/profile/complete` 相当の画面へリダイレクトする。個人・法人代表者・法人一般担当者のいずれのロールでも共通のゲートとして扱う。
