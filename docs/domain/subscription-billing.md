# ランク・サブスクリプション（Subscription & Billing）

## このコンテキストの責務

このドキュメントは「会員（個人・法人）がどのランクに属し、月額課金・初期費用・プラン変更・月次仕入れ上限がどう管理されるか」を定義する。

**扱うこと**:

- 会員ランク（STARTER〜ENTERPRISEの7段階）の定義・序列・料金・月次仕入れ上限
- ランクとStripeサブスクリプションの対応関係
- プラン変更（アップグレード・ダウングレード）のタイミング・Stripe操作・DB更新
- 初期費用の課金・差分請求ルール
- 月次仕入れ上限の集計期間（`billing_anchor_day`）の考え方

**扱わないこと**:

- 招待・会員登録（新規登録時のプラン選択画面そのもの）・退会・アカウント停止は[[membership]]が扱う。本ドキュメントは「ランクが決まった後、そのランクがどう課金・変更されるか」に閉じる
- 商品ごとの掛け率・ランク制限商品の閲覧可否判定ロジックは`catalog.md`（未着手）が扱う。本ドキュメントはランクの序列・月次仕入れ上限の定義までを扱う
- 月次仕入れ上限を実際にどう消費・判定するか（カート・注文確定時のチェック）は`ordering.md`（未着手）が扱う
- 法人組織（`organizations`）とそのメンバー管理（`organization_memberships`）の仕組み自体は`ordering.md`が扱う。本ドキュメントは「法人もユーザーと対称的にランク・サブスクリプションを持つ」という前提のみ扱う

## 主要な概念・用語

`docs/glossary.md`の「会員・ランク」「サブスクリプション」を踏まえ、以下を追加で定義する。用語集への追記が必要（後述）。

| 用語                     | 定義                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ランク序列**           | STARTER < BASIC < STANDARD < PRO < ADVANCED < PREMIUM < ENTERPRISEの7段階の順序。DB上は`member_ranks.sort_order`で明示的に持つ                                                               |
| **月次期間（起算日）**   | 月間仕入れ上限を集計する1ヶ月間。暦月ではなく`billing_anchor_day`（1〜28）を起点に算出する                                                                                                   |
| **billing_anchor_day**   | 月次期間の起点となる「日」（1〜28）。新規登録日の日付を初期値とし、アップグレード時に今日の日付へリセットされる。29〜31日登録の場合は28に丸める                                              |
| **ダウングレード予約**   | ダウングレードを申請した時点ではランクは変わらず、現在の請求期間が終わるまで現ランクを維持し、期末に自動で新ランクへ切り替わる予約状態                                                       |
| **初期費用の差分請求**   | アップグレード時に「新ランクの初期費用 − 支払い済み最高ランクの初期費用」の差額のみを請求すること。ダウングレードでは初期費用の返金は発生しない                                              |
| **支払い済み最高ランク** | これまでに初期費用を支払った中で最も高いランク（`initial_fee_paid_rank_code`）。退会後も保持し、再入会時の初期費用免除判定に使う                                                             |
| **ランク変更履歴**       | 「いつ・誰の操作で・どのランクからどのランクに変わったか」を追記専用で記録するログ（`rank_changes`）。現在値（`users`/`organizations`/`subscriptions`の`rank_code`）とは別テーブルで管理する |

## 業務ルール・不変条件

### 確定しているもの

**ランクの構成**

- 7ランク制（STARTER / BASIC / STANDARD / PRO / ADVANCED / PREMIUM / ENTERPRISE）。名称・月額費用・初期費用・商品掛け率は`archive/service-spec.md`の「会員プラン」節を正とする（実装済み: `src/domain/value-objects/member-rank.ts`の`RANK_ORDER`）
- ENTERPRISEはセルフサービスの選択肢に含まれない。管理者がStripeダッシュボードで個別にカスタムプライスのサブスクリプションを作成し会員へ送付する形で契約する（`specs/001-seven-rank-pricing/spec.md` FR-006）
- 月間仕入れ上限は現時点で暫定値（`src/domain/value-objects/member-rank.ts`の`MONTHLY_LIMITS`にTODOコメント付きで暫定設定済み）。確定次第、コード側の唯一の定義箇所を更新する。**単一の情報源の原則**（`specs/001-seven-rank-pricing/spec.md` SC-003）により、上限値をコード内の複数箇所に書き写さない
- 個人（`users`）・法人（`organizations`）は対称的にランク・月次期間・サブスクリプションを持つ。法人組織に所属するユーザーは個人としての会員ランクを使用しない（`specs/005-b2b-organization/spec.md` FR-022、排他的な扱い）

**アップグレード**

- 即時反映。今日を新しい起点として`billing_anchor_day`をリセットする（Stripe側は`billing_cycle_anchor: 'now'`, `proration_behavior: 'create_prorations'`で日割り精算）
- 月次仕入れ上限の使用済み額は新しい期間の開始とともに¥0からリセットされる（旧期間の使用済み額は引き継がない）
- 初期費用は「新ランクの初期費用 − 支払い済み最高ランクの初期費用」の差分のみを請求する。差分が発生した場合のみ`initial_fee_paid_rank_code`を新ランクへ更新する
- ダウングレード予約中（後述）にアップグレードする場合は、既存の予約（Stripe Subscription Schedule）を解放してから通常のアップグレード処理を行う

**ダウングレード**

- 期末適用。現在の請求期間が終わるまでは現ランクのまま継続し、期間終了時にStripe側（Subscription Schedule）が自動で新ランクへ切り替える
- `billing_anchor_day`は変更しない
- 初期費用の返金は発生しない
- 期末になるまではダウングレードの申請を取り消せる（現ランドの維持を選び直せる）
- **期末適用に変更した理由**（`docs/plan-change-flow.md`より。`archive/user-stories.md`の旧仕様「即時反映」から変更済み）:
  1. Invoiceフロー（注文確認〜請求書発行まで数日かかる）との整合性 — 即時ダウングレードで仕入れ上限が突然下がると進行中の注文が宙に浮く
  2. 卸売事業者の月単位の仕入れ計画を月途中で壊さない
  3. 現行期間分はすでに支払い済みであり、その恩恵を受け切るのが公平
  4. GitHub・Notion・Linear等の主要SaaSと同じ方針

**プラン変更の統合ユースケース**

- 呼び出し元はアップグレード/ダウングレード/予約取消（ランクを現在値に戻す操作）を区別せず、`changePlan(owner, targetPlan)`を呼ぶだけで全パターンに対応する設計とする（`docs/plan-change-flow.md`の決定木を参照）
  - `pendingRank == target` → no-op（早期リターン）
  - `target > current` → アップグレード
  - `target < current` → ダウングレード（予約中なら既存予約のフェーズを更新、無ければ新規作成）
  - `target == current`（ダウングレード予約中に現ランクへ戻す） → 予約の取消（Subscription Scheduleを解放）
- Stripeのイベント（`customer.subscription.updated`）は、`schedule`の有無と価格変化の有無で「即時アップグレード確定」か「期末ダウングレード確定」かを判定する。詳細は`docs/plan-change-flow.md`の「Webhookハンドラー全体像」を参照

**再入会時の初期費用判定**

- 選択プラン ≤ 支払い済み最高ランク → 初期費用免除
- 選択プラン ＞ 支払い済み最高ランク → 差分を請求
- 退会・再入会をまたいでも`initial_fee_paid_rank_code`は保持される（[[membership]]の退会ルールと関連）

### まだ決まっていない・要確認事項

- 🔲 **月間仕入れ上限（`monthly_limit_amount`）の確定値**: `archive/service-spec.md`では全ランクTBD。コード側（`member-rank.ts`）には暫定値が入っているが、`specs/001-seven-rank-pricing/research.md`に基づく暫定であり正式決定ではない
- 🔲 **ENTERPRISEの月額費用・初期費用**: 個別契約のため定価なし。「要相談」のまま
- 🔲 **旧5ランクモデル時代の付加機能（専任担当者サポート・優先対応・専用ライン等）の扱い**: `docs/glossary.md`に「要確認」として残っており、新7ランクモデルでどのランクに何が付くか、あるいは廃止されたかが未確定
- 🔲 **`billing_anchor_day`の確定スキーマ配置**: `docs/plan-change-flow.md`は`users`単体への追加を前提に書かれていたが、`db-schema-redesign.md`では`users`と`organizations`の両方に対称的に追加する設計に更新されている（下記「参考資料」参照）。本ドキュメントは後者（新しい設計）を正として記述している

## 他コンテキストとの関係

### [[membership]]との境界

会員登録時のプラン選択画面（STARTER〜PREMIUMの6ランクを選択肢として表示する動線）・退会時のサブスクリプション解約・停止中の課金一時停止は[[membership]]の責務。本ドキュメントは「登録後・退会前」の期間における、ランクそのものの管理・変更ルールを扱う。

### `catalog.md`（未着手）との境界

商品ごとの最低アクセスランク・掛け率の設定は`catalog.md`が扱う。本ドキュメントが定義する「ランク序列」「会員の現在ランク」を`catalog.md`側が参照してアクセス可否・価格を判定する（`MemberRank.canAccess()`）。

### `ordering.md`（未着手）との境界

- カート・注文確定時に「今月あといくら仕入れられるか」を判定するロジック（`仕入れ残枠 = 月間仕入れ上限 − 当月の使用済み額`の集計）は`ordering.md`が扱う。本ドキュメントは上限値そのものの定義・集計期間の起点（`billing_anchor_day`）までを扱う
- 注文確定時のランクスナップショット（`rank_code_at_order`・`monthly_limit_at_order`）は`orders`テーブル側の話であり`ordering.md`が扱う。本ドキュメントが定義するランク・上限値を「注文時点で固定して残す」という関係
- 法人組織のメンバー管理・注文承認フロー（`org:admin`のみ承認可能等）は`ordering.md`が扱う。本ドキュメントは組織がユーザーと対称的にランク・サブスクリプションを持つという前提のみ扱う

### [[admin-rbac]]との境界

運営者（請求・顧客担当）による請求書発行・会員一覧閲覧の権限可否は[[admin-rbac]]の権限マトリクスに従う。運営者が会員のランクを強制変更するような操作フローが今後追加される場合、`rank_changes.changed_by = 'admin'`として記録される想定だが、現時点で運営者による強制ランク変更の具体的な操作画面は未設計。

## 参考資料

- `docs/db-schema-redesign.md` の`member_ranks`（新設・参照テーブル）節、`users`/`organizations`の`rank_code`・`billing_anchor_day`・`initial_fee_paid_rank_code`列、`subscriptions`（新設）節、`rank_changes`（新設・追記専用）節
  - 旧`member_rank` ENUM型は`member_ranks`参照テーブルへ置き換えられる（7ランク移行で2回に分けてマイグレーションする運用負債が発生した反省による）。**`member_ranks`は`supabase/migrations/20260816151000_create_member_ranks.sql`で実装済み**（移行方針1番）
  - 旧`organizations.pending_rank`は`subscriptions.pending_rank_code`へ、`stripe_subscription_id`/`stripe_subscription_schedule_id`は`users`/`organizations`から`subscriptions`へ、それぞれ移動する設計になっている。**`subscriptions`/`rank_changes`/`stripe_webhook_events`は`supabase/migrations/20260816175631_create_subscriptions_rank_changes_stripe_webhook_events.sql`で実装済み**（移行方針2番）。ただし`users`/`organizations`の既存Stripeカラムからのバックフィル（移行方針3番）は未実施のため、`users.rank_code`等のキャッシュ更新と`rank_changes`へのINSERTを同一トランザクションで行うアプリケーションコード側の追従はまだ無い
- （旧`docs/archive/service-spec.md`「会員プラン」節・「ランク変更ルール」節を材料に執筆。ドメインドキュメント全体完了に伴いarchiveは削除済み）
- `docs/plan-change-flow.md` — プラン変更のStripe操作・Webhookハンドラー・`changePlan`統合ユースケースの詳細設計（本ドキュメントの「業務ルール」節は主にこれを要約）
- `specs/001-seven-rank-pricing/` — 旧5ランクから新7ランクへの移行spec。`data-model.md`に`MemberRank`のコード定義・DB移行手順あり
- `specs/005-b2b-organization/spec.md` — 法人組織のランク・月次仕入れ上限が個人と独立して管理されるというFR-003・FR-022の定義
- 実装: `src/domain/value-objects/member-rank.ts`（`RANK_ORDER`・`MONTHLY_LIMITS`・`MemberRank`クラス）、`src/lib/sanity/products.ts`（`RANK_ORDER`参照）、`src/app/onboarding/plan/`（プラン選択画面。[[membership]]の責務）
