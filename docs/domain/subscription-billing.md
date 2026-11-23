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
- 法人会員（`users.member_type='corporate'`）と個人会員の区別・オンボーディング時の追加入力（会社名・インボイス番号）の仕組み自体は[[membership]]が扱う。本ドキュメントは「法人も個人と同じ`users`行としてランク・サブスクリプションを持つ」という前提のみ扱う

## 主要な概念・用語

`docs/glossary.md`の「会員・ランク」「サブスクリプション」を踏まえ、以下を追加で定義する。用語集への追記が必要（後述）。

| 用語                     | 定義                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ランク序列**           | STARTER < BASIC < STANDARD < PRO < ADVANCED < PREMIUM < ENTERPRISEの7段階の順序。DB上は`member_ranks.sort_order`で明示的に持つ                                                                                 |
| **月次期間（起算日）**   | 月間仕入れ上限を集計する1ヶ月間。暦月ではなく`billing_anchor_day`（1〜28）を起点に算出する                                                                                                                     |
| **billing_anchor_day**   | 月次期間の起点となる「日」（1〜28）。新規登録日の日付（Stripeのサブスクリプションの`start_date`をJSTに変換した日付）を初期値とし、アップグレード時に今日の日付へリセットされる。29〜31日登録の場合は28に丸める |
| **ダウングレード予約**   | ダウングレードを申請した時点ではランクは変わらず、現在の請求期間が終わるまで現ランクを維持し、期末に自動で新ランクへ切り替わる予約状態                                                                         |
| **初期費用の差分請求**   | アップグレード時に「新ランクの初期費用 − 支払い済み最高ランクの初期費用」の差額のみを請求すること。ダウングレードでは初期費用の返金は発生しない                                                                |
| **支払い済み最高ランク** | これまでに初期費用を支払った中で最も高いランク（`initial_fee_paid_rank_code`）。退会後も保持し、再入会時の初期費用免除判定に使う                                                                               |
| **ランク変更履歴**       | 「いつ・誰の操作で・どのランクからどのランクに変わったか」を追記専用で記録するログ（`rank_changes`）。現在値（`users`/`subscriptions`の`rank_code`）とは別テーブルで管理する                                   |

## 業務ルール・不変条件

### 確定しているもの

**ランクの構成**

- 7ランク制（STARTER / BASIC / STANDARD / PRO / ADVANCED / PREMIUM / ENTERPRISE）。名称・月額費用・初期費用・商品掛け率は`archive/service-spec.md`の「会員プラン」節を正とする（実装済み: `src/domain/value-objects/member-rank.ts`の`RANK_ORDER`）
- ENTERPRISEはセルフサービスの選択肢に含まれない。管理者がStripeダッシュボードで個別にカスタムプライスのサブスクリプションを作成し会員へ送付する形で契約する（`specs/001-seven-rank-pricing/spec.md` FR-006）
- 月間仕入れ上限の金額の正は`member_ranks.monthly_limit_amount`（NULL = 無制限。ENTERPRISE）。現在の値（STARTER 30万円〜PREMIUM 1億円）を正式な暫定値とし、変更は`member_ranks`の行の更新だけで済む（GitHub issue #210）。注文確定時の上限チェック・カートの残り枠表示はどちらもこの値を読む。**単一の情報源の原則**（`specs/001-seven-rank-pricing/spec.md` SC-003）により、上限値をコードに書き写さない
- 個人・法人（`users.member_type`）とも同じ`users`行がランク・月次期間・サブスクリプションを持つ。1アカウント＝1担当者であり、複数メンバーで契約・月次上限を共有する仕組みは無い（2026-09-12方針転換、GitHub issue #200。詳細は[[membership]]「個人と法人の関係」節）

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

**支払い失敗・Stripe側の解約**（2026-10-18決定、親issue #375・#376）

月額費用の支払いに失敗している間（Stripeが再請求している間）は新規注文を止めてカードの更新を促し、再請求が尽きてStripeがサブスクリプションを解約したら会員の利用を止める。解約されても退会（`users.deleted_at`）にはしない（[[membership]]「Stripe側の解約による利用停止」）。

- 状態の遷移（Stripeの仕様）: 2回目以降の月額の支払いに失敗すると`active`→`past_due`になる。再請求のうちどれかが成功すれば`active`に戻る。再請求がすべて失敗すると、Stripeの設定（下記）により`canceled`になる。`past_due`の間もStripeは次の請求期間の請求書を作り続ける
- `subscriptions.status`はStripeの値をそのまま写し、判定はアプリ側の下表で行う（`docs/db-schema-redesign.md`「subscriptions」節）

| `subscriptions.status`                                                      | 会員から見た状態 | 新規注文                       | 表示                                                                                     | ログイン                       |
| --------------------------------------------------------------------------- | ---------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------ |
| `active`・`trialing`                                                        | 通常             | できる                         | 通常                                                                                     | できる                         |
| `past_due`（支払い失敗中）                                                  | 支払い失敗中     | できない（進行中の注文は続く） | 会員画面の共通レイアウトに、カードの更新の案内とBilling Portal（#216）へのボタン（#379） | できる                         |
| `unpaid`（使わない設定だが、万一なった場合）                                | 支払い失敗中     | できない                       | `past_due`と同じ                                                                         | できる                         |
| `canceled`・`incomplete_expired`（入会済みで、解約済みでない行が1つも無い） | 利用停止         | できない                       | 利用停止の案内画面だけ（#380）                                                           | できる（案内画面だけ見られる） |
| `incomplete`                                                                | —                | —                              | —                                                                                        | —                              |

- `incomplete`は入会の初回の支払いが終わっていない状態で、`subscriptions`の行は入会の`checkout.session.completed`（支払い済み）で作るため、行としては現れない。入会前かどうかは`users.onboarding_completed`で判定し、入会前の会員はオンボーディングに送る（[[membership]]「Stripe側の解約による利用停止」の判定の順）
- Stripeの`paused`はv1では起きない（再請求後の設定で「一時停止」を選ばず、`subscriptions.status`のCHECK制約にも無い）。管理者による停止（#206、post-v1）でStripeの一時停止を使う場合は、そのときにCHECK制約とこの表に足す
- 利用停止の判定は、退会（`deleted_at`）・入会前（`onboarding_completed`）の判定の後に行う。退会でStripeのサブスクリプションを解約しても`customer.subscription.deleted`が届いて`canceled`になるが、その会員は退会済みとして`/withdrawn`に送る
- **支払い失敗中にしてよい操作**: 進行中の注文の続き（請求書払いの支払い、運営者による請求作成など）は止めない（管理者による停止中の扱いと揃える。[[membership]]）。カートへの追加も止めない（カードを更新すればそのまま注文できるようにする）。プラン変更（#209）は止め、先にカードの更新を促す（支払い失敗中にアップグレードすると、日割りの請求も同じカードで失敗するため）
- **状態を同期するWebhook**（#377）:
  - `customer.subscription.updated`: `status`・`current_period_start`/`current_period_end`・`cancel_at_period_end`をStripeの値に更新する。`past_due`になったとき・再請求の成功で`active`に戻ったとき・月額の更新で請求期間が進んだときのいずれもこれで拾う。プラン変更の確定（#209）も同じイベントで判定する
  - `customer.subscription.deleted`: `status='canceled'`・`canceled_at`を記録する（再請求が尽きた解約・退会による解約のどちらでも届く）
  - `invoice.payment_failed`は処理しない（下記「支払い失敗の会員への通知」でStripeの自動メールに任せるため。状態は`customer.subscription.updated`で分かる）
  - 再配信・順序の入れ替わりで古い状態に戻らないよう、`stripe_webhook_events`で冪等にし、Stripeから取り直した最新のSubscriptionで更新する（詳細は#377）
  - StripeダッシュボードのWebhookエンドポイント（テストモード・本番それぞれ）の購読イベントに`customer.subscription.updated`・`customer.subscription.deleted`を加える
- **Stripe側の設定**（テストモード・本番それぞれ、ダッシュボードで設定する）:
  - 再請求（Smart Retries）: 「請求 → 売上回収 → 再試行」で、Stripeの既定（2週間で最大8回）を使う。会員が支払い失敗に気づいてからカードを更新するまでの猶予として2週間あれば足り、それより延ばすと支払われない月額の期間が長くなるため
  - 再請求がすべて失敗した後: 同じ画面で「サブスクリプションをキャンセルする」を選ぶ（`canceled`にする）。「未払いとしてマーク」（`unpaid`。Stripeは請求書を下書きのまま作り続け、支払いを試みない）・「期日超過のままにする」（`past_due`のまま請求書を作り続ける）・「一時停止」は使わない。解約された会員の扱いを1通りにするため
  - 支払い失敗時のメール: 「売上回収 → メール」で「カード支払いが失敗した場合にメールを送信」を有効にし、リンク先にStripeのホストするページを選ぶ（会員がアプリにログインしなくても、メールから直接カードを更新して支払える）。テストモードでは、チームメンバーの確認済みのメールアドレスにしか届かない
  - メニュー名はStripeの公式ドキュメント（[Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)・[顧客へのメール](https://docs.stripe.com/billing/revenue-recovery/customer-emails)・[サブスクリプションの仕組み](https://docs.stripe.com/billing/subscriptions/overview)）の表記。画面の表記が違えば、ここを直す
- **支払い失敗の会員への通知**（2026-11-23決定、#376）: Stripeの自動メール（上記）を使い、`invoice.payment_failed`を受けてResendで自前のメールを送ることはしない。会員への請求書メールもStripeの自動送信に任せている（[[ordering]]「通知」）のと揃い、Webhookの処理を増やさずに済むため。アプリ内の案内は#379の表示で行う
- **再請求の期限の表示**: 会員画面の案内（#379）には具体的な日付を出さず、「お支払い方法を更新しないと、最初の支払い失敗から2週間ほどでご利用が止まります」程度にとどめる。再請求の日程はStripeが決める（Smart Retriesは失敗の傾向から日時を選ぶ）ため。正確な日付が必要になれば、StripeのInvoiceの`next_payment_attempt`を使う

### まだ決まっていない・要確認事項

- ✅ ~~月間仕入れ上限（`monthly_limit_amount`）の確定値~~（2026-09-21解決）: 現状ハードコードされている値（starter:30万/basic:100万/standard:500万/pro:2000万/advanced:5000万/premium:1億/enterprise:実質無制限）を正式な暫定値として採用。`member_ranks`テーブル参照への切り替え（issue #210）が完了すれば、以後の変更はDB更新のみで済む
- 🔲 **ENTERPRISEの月額費用・初期費用**: 個別契約のため定価なし。「要相談」のまま
- 🔲 **旧5ランクモデル時代の付加機能（専任担当者サポート・優先対応・専用ライン等）の扱い**: `docs/glossary.md`に「要確認」として残っており、新7ランクモデルでどのランクに何が付くか、あるいは廃止されたかが未確定
- ✅ ~~`billing_anchor_day`の確定スキーマ配置~~（2026-09-22解決）: `users.billing_anchor_day`のみに存在する（2026-09-12方針転換、GitHub issue #200により`organizations`テーブル自体が削除されたため）。法人会員（`member_type='corporate'`）も個人と同じ`users`行の`billing_anchor_day`を使う

## 他コンテキストとの関係

### [[membership]]との境界

会員登録時のプラン選択画面（STARTER〜PREMIUMの6ランクを選択肢として表示する動線）・退会時のサブスクリプション解約・停止中の課金一時停止は[[membership]]の責務。本ドキュメントは「登録後・退会前」の期間における、ランクそのものの管理・変更ルールを扱う。

支払い失敗・Stripe側の解約は、`subscriptions.status`の値ごとに会員に何が起きるか・Webhook・Stripeの設定までを本ドキュメントが扱い、Stripe側の解約による利用停止が退会・停止とどう違うか・再契約や退会をどう扱うかは[[membership]]が扱う。新規注文を止める条件は[[ordering]]にも書く。

### `catalog.md`（未着手）との境界

商品ごとの最低アクセスランク・掛け率の設定は`catalog.md`が扱う。本ドキュメントが定義する「ランク序列」「会員の現在ランク」を`catalog.md`側が参照してアクセス可否・価格を判定する（`MemberRank.canAccess()`）。

### `ordering.md`（未着手）との境界

- カート・注文確定時に「今月あといくら仕入れられるか」を判定するロジック（`仕入れ残枠 = 月間仕入れ上限 − 当月の使用済み額`の集計）は`ordering.md`が扱う。本ドキュメントは上限値そのものの定義・集計期間の起点（`billing_anchor_day`）までを扱う
- 注文確定時のランクスナップショット（`rank_code_at_order`・`monthly_limit_at_order`）は`orders`テーブル側の話であり`ordering.md`が扱う。本ドキュメントが定義するランク・上限値を「注文時点で固定して残す」という関係
- 法人会員（`users.member_type='corporate'`）の区別は`membership.md`が扱う。本ドキュメントは法人も個人と同じ`users`行としてランク・サブスクリプションを持つという前提のみ扱う。なお複数メンバー共有型の法人組織・組織内の注文承認フローはVer1では実装しない（2026-09-12方針転換、GitHub issue #200、`ordering.md`参照）

### [[admin-rbac]]との境界

運営者（請求・顧客担当）による請求書発行・会員一覧閲覧の権限可否は[[admin-rbac]]の権限マトリクスに従う。運営者が会員のランクを強制変更するような操作フローが今後追加される場合、`rank_changes.changed_by = 'admin'`として記録される想定だが、現時点で運営者による強制ランク変更の具体的な操作画面は未設計。

## 参考資料

- `docs/db-schema-redesign.md` の`member_ranks`（新設・参照テーブル）節、`users`の`rank_code`・`billing_anchor_day`・`initial_fee_paid_rank_code`・`member_type`列、`subscriptions`（新設）節、`rank_changes`（新設・追記専用）節。`organizations`/`organization_memberships`を含む2026-09-12方針転換（GitHub issue #200）前の設計は、同ドキュメントの当時の版を参照
  - 旧`member_rank` ENUM型は`member_ranks`参照テーブルへ置き換えられる（7ランク移行で2回に分けてマイグレーションする運用負債が発生した反省による）。**`member_ranks`は`supabase/migrations/20260816151000_create_member_ranks.sql`で実装済み**（移行方針1番）
  - `subscriptions`/`rank_changes`/`stripe_webhook_events`は`supabase/migrations/20260816175631_create_subscriptions_rank_changes_stripe_webhook_events.sql`で実装済み（移行方針2番）。当初は`user_id`/`organization_id`の排他制約付きで新設したが、2026-09-12方針転換（GitHub issue #200）により`organization_id`列・排他制約は削除し、`user_id`をNOT NULLに変更済み（`supabase/migrations/20260922051428_drop_organizations_and_organization_id_columns.sql`）
  - `users.member_type`（`individual`/`corporate`）・`company_name`・`invoice_registration_number`は`supabase/migrations/20260922045432_add_member_type_columns_to_users.sql`で実装済み（GitHub issue #200）
- （旧`docs/archive/service-spec.md`「会員プラン」節・「ランク変更ルール」節を材料に執筆。ドメインドキュメント全体完了に伴いarchiveは削除済み）
- `docs/plan-change-flow.md` — プラン変更のStripe操作・Webhookハンドラー・`changePlan`統合ユースケースの詳細設計（本ドキュメントの「業務ルール」節は主にこれを要約）
- `specs/001-seven-rank-pricing/` — 旧5ランクから新7ランクへの移行spec。`data-model.md`に`MemberRank`のコード定義・DB移行手順あり
- `specs/005-b2b-organization/spec.md` — 複数メンバー共有型の法人組織モデルの旧spec。2026-09-12方針転換（GitHub issue #200）により実装対象から外れたが、Ver2以降で再導入する場合の参考資料として残す（移行手順は[[membership]]「将来、複数メンバー対応（Ver2以降）を実装する際の移行手順」節参照）
- 実装: `src/domain/value-objects/member-rank.ts`（`RANK_ORDER`・`MemberRank`クラス）、`src/domain/value-objects/monthly-limit.ts`（`MonthlyLimit`。無制限を含む上限の判定）、`src/infrastructure/supabase/supabase-member-rank-repository.ts`（`member_ranks`から上限を読む）、`src/infrastructure/sanity/sanity-catalog-query-service.ts`（`MemberRank.accessibleRanks()`で商品を絞り込む）、`src/app/onboarding/plan/`（プラン選択画面。[[membership]]の責務）
