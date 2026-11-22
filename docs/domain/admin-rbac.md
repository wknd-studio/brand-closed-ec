# 運営者権限管理（Admin RBAC）

## このコンテキストの責務

このドキュメントは「運営組織のスタッフが、何のロールを持ち、何ができるか」を定義する。

**扱うこと**:

- 運営スタッフ（管理者・請求顧客担当・調達担当）の身元とロールの管理
- ロールごとの権限（何ができて何ができないか）
- Clerkとの役割分担（ロール定義の正はどちらか）

**扱わないこと**:

- 会員側（顧客）のロール・権限は扱わない。個人会員はロールを持たず、法人会員（組織）内の権限（`org:admin`/`org:member`）の定義は[[membership]]が扱う。なお法人組織内の注文承認フローはVer1では実装しない（2026-09-13廃止、[[ordering]]参照）ため、Ver1時点でこの権限が注文フローに影響することはない
- 権限を使って実際に何が行われるか（招待の発行そのもの・発注作業そのもの・返品処理そのもの）の業務ロジックは、それぞれの担当コンテキスト（招待は[[membership]]、発注は`procurement.md`、返品は`returns.md`）が扱う。このドキュメントは「その操作を許可されているか」の判定基準までを扱う

## 主要な概念・用語

`docs/glossary.md`の「運営者」の定義（招待コード発行・会員・商品・注文・発注を管理するサービス管理者。無在庫転売型モデルのため在庫は保有しない）を踏まえ、以下を追加で定義する。

| 用語               | 定義                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **運営スタッフ**   | 運営組織に所属するClerkアカウント。会員（顧客）とは別の集約として管理される。DB上は`admin_users`で表現する                                                               |
| **運営組織**       | 御社（運営会社）自身を表すClerk Organization。現時点では1つのみを前提とする。顧客企業の`organizations`（法人会員）とは完全に別の概念                                     |
| **ロールキー**     | Clerk Organizations のカスタムロール機能で定義される識別子（`org:ops_admin` 等。「権限マトリクス」の列の見出し）。DBには`admin_memberships.clerk_role`としてミラーされる |
| **管理者**         | 全機能にアクセスできる運営者ロール。担当者アカウントの管理も担う                                                                                                         |
| **請求・顧客担当** | 請求書の発行・会員からの問い合わせ対応を担う運営者ロール                                                                                                                 |
| **調達担当**       | 仕入れ先への発注・注文ステータスの更新を担う運営者ロール                                                                                                                 |
| **カスタム権限**   | Clerkのカスタム権限機能で定義される、ロールに紐づく個別の操作許可（`org:orders:cancel` 等。「権限マトリクス」の権限キーの列）。DBには持たず、Clerk側のみで定義される     |

## 業務ルール・不変条件

### 確定しているもの

- **3ロール制**: 管理者・請求顧客担当・調達担当の3種類。権限マトリクスは`archive/service-spec.md`の「運営者ロール」に定義済み（本ドキュメントの「権限マトリクス」セクションに転記）
- **運営組織は1つだけ**: 複数の運営組織（例: 外部委託先3PL等）が必要になる具体的な要件が今のところ無いため、`admin_organizations`テーブルは持たない。1運営スタッフ（`admin_users`）は常に1ロール（`admin_memberships`）しか持てない（`admin_memberships.admin_user_id`はUNIQUE）
- **顧客と運営スタッフは別集約**: 同じ人物が会員（`users`）と運営スタッフ（`admin_users`）を兼ねることは許容するが、DB上は別テーブル・別行として扱う。`users`は`rank_code`等の顧客専用列を必ず持つため、運営スタッフをそこに混ぜると無意味な既定値を持たせることになる
- **ロールの定義そのものはClerkが正**: 「どんなロールがあり、どんな権限を持つか」はClerkのカスタムロール/カスタム権限機能で管理する。DBは`admin_memberships.clerk_role`として現在のロールキー文字列をミラーするだけで、権限マトリクスの中身をDBに二重管理しない
- **認可判定はアプリケーション層**: 実際に「このスタッフはこの操作ができるか」を判定するのはアプリケーション層の`has({ permission })`であり、DBのCHECK制約やRLSでは判定しない（詳細は「他コンテキストとの関係」の「Clerkとの役割分担」参照）
- **書き込み経路はClerk Webhookのみ**: `admin_users`/`admin_memberships`へのINSERT/UPDATE/DELETEは、Clerkの`organizationMembership.*`等のWebhookイベント経由のミラーリングに限定する。アプリケーションから直接書き込むパスは存在しない。メンバーの追加・削除・ロール変更は必ずClerk側（Dashboard/Backend API）で行う
- **ロールキー・権限キーの命名**（2026-11-23確定、#390）: ロールキーは `org:ops_<ロール>`（`org:ops_admin`・`org:ops_billing`・`org:ops_procurement`）、権限キーは `org:<対象>:<操作>` で、権限マトリクスの1行 = 1権限キーにする。ロールキーを顧客の組織と同じ `org:admin` にしないのは、Clerk のロールと「ロールに付いた権限」はインスタンス全体で1つで、`org:admin` に運営の権限を付けると法人会員の組織の管理者にも同じ権限が付いてしまうため（判定関数は運営組織がアクティブなことも確かめるが、二重に防ぐ）
- **`clerk_role`にCHECK制約は付けない**: ロールが将来増減してもマイグレーション不要にするための意図的なトレードオフ。バリデーションの責務はDB（構造的検証）からアプリケーション層（ホワイトリスト方式・未知のロールはデフォルトで権限なし＝fail closed）に移す

### まだ決まっていない・要確認事項

- 🔲 運営スタッフが管理画面に入ったときに運営組織をアクティブにする方法（[#391](https://github.com/wknd-studio/brand-closed-ec/issues/391) で決める）。`has({ permission })` はセッションでアクティブな組織の権限しか見ないため、アクティブでなければ判定関数は拒否する。候補は、admin の layout でアクティブな組織が運営組織でなければ Client Component から `setActive({ organization })` で切り替える方法（`clerkMiddleware` の `organizationSyncOptions` はURLに組織のslug・IDを含める必要があるため合わない）
- 🔲 本番インスタンスの契約プランでカスタムロール・カスタム権限・Role Set が使えるか（開発インスタンスでは使える。本番の設定の前に確認する。「Clerk の設定と検査」）
- 🔲 運営スタッフの新規追加・削除・ロール変更の具体的なオペレーション手順（Clerk Dashboard経由を想定しているが、専用の運営画面UIを用意するかは未確定）
- 🔲 Clerk Webhookの受信ログ・べき等性の仕組みを、`stripe_webhook_events`と同様にClerk Webhookにも用意するかは実装時の検討事項（`db-schema-redesign.md`より）
- 🔲 DB上のロールキーとClerk側のロール定義との不整合を検知する監視バッチの具体的な実装（`db-schema-redesign.md`では「運用として持つ」方針のみ示されており、実装は未定）
- 🔲 将来、運営組織を複数に分ける場合の移行手順（`admin_organization_id`カラム追加を想定した拡張ポイントはある。「参考資料」参照）

## 権限マトリクス

`archive/service-spec.md`から転記した旧マトリクスを土台に、2026-09-14〜20の一連の設計変更（決済単位の分離・法人組織の注文承認フロー廃止・調達/配送/返品の各フェーズ確定）を反映して全面更新。

この表は、Clerk の設定の正しい形でもある。ロールと「ロールごとの権限」はコードに持たず Clerk を正にし、Clerk の設定がこの表どおりかは `task clerk:admin-rbac:check` で検査する（「Clerk の設定と検査」）。権限キーの列は `src/domain/value-objects/admin-permission.ts` の権限キーと一致させる（`tests/unit/clerk-admin-rbac.test.ts` が検査する）。表の形（列の見出しのロールキー・権限キーの列・✅／—）を変えるときは、検査のスクリプト（`scripts/clerk-admin-rbac.ts`）の読み取りも合わせて直す。

| 機能                                                             | 権限キー                            | 管理者（`org:ops_admin`） | 請求・顧客担当（`org:ops_billing`） | 調達担当（`org:ops_procurement`） |
| ---------------------------------------------------------------- | ----------------------------------- | :-----------------------: | :---------------------------------: | :-------------------------------: |
| 会員の停止・停止解除                                             | `org:members:suspend`               |            ✅             |                  —                  |                 —                 |
| 会員の強制退会                                                   | `org:members:force_withdraw`        |            ✅             |                  —                  |                 —                 |
| 招待コード発行・無効化                                           | `org:invitation_codes:manage`       |            ✅             |                  —                  |                 —                 |
| 会員一覧・詳細閲覧                                               | `org:members:read`                  |            ✅             |                 ✅                  |                 —                 |
| 会員の招待ステータス設定                                         | `org:members:set_invitation_status` |            ✅             |                  —                  |                 —                 |
| 商品の登録・編集・削除（Sanity Studio）                          | `org:products:manage`               |            ✅             |                  —                  |                ✅                 |
| 注文一覧・詳細閲覧                                               | `org:orders:read`                   |            ✅             |                 ✅                  |                ✅                 |
| 注文キャンセル（決済単位が1件も作られる前）                      | `org:orders:cancel`                 |            ✅             |                 ✅                  |                 —                 |
| 請求作成（後払い明細を選んでInvoiceを発行）                      | `org:invoices:create`               |            ✅             |                 ✅                  |                 —                 |
| 決済単位のキャンセル（`limit_exceeded`からの回復・保留分の取消） | `org:settlements:cancel`            |            ✅             |                 ✅                  |                 —                 |
| 発注タスクの着手・発注確定（[[procurement]]）                    | `org:procurement:manage`            |            ✅             |                  —                  |                ✅                 |
| 入荷検品の記録（明細単位の`received_at`）                        | `org:receiving:record`              |            ✅             |                  —                  |                ✅                 |
| 出荷の着手・発送記録（[[fulfillment]]）                          | `org:shipments:manage`              |            ✅             |                  —                  |                ✅                 |
| 配達完了の記録                                                   | `org:deliveries:record`             |            ✅             |                  —                  |                ✅                 |
| **返品・返金の承認・却下・返金実行**（2026-09-14確定）           | `org:returns:manage`                |            ✅             |                  —                  |                 —                 |
| お知らせ投稿                                                     | `org:announcements:manage`          |            ✅             |                  —                  |                 —                 |
| 担当者アカウント管理                                             | `org:staff:manage`                  |            ✅             |                  —                  |                 —                 |

「担当者アカウント管理」＝運営スタッフの追加・削除・ロール変更の指示権限を指す（実際の書き込みはClerk Webhook経由）。この操作自体は管理者ロールのみに許可されるが、実行の入り口はClerk Dashboard/Backend APIであり、DBはその結果をミラーするだけである点に注意（「業務ルール」参照）。

**返品・返金の承認を管理者のみに限定する理由**: 返金はお金が動く例外対応であり、御社は顧客都合のキャンセル・返品を原則不可としているため（[[returns]]参照）、権限を請求・顧客担当まで広げる理由がない。旧`archive/operations-order.md`の運用（`paid`以降のキャンセルは管理者のみ）をそのまま踏襲する。

## 認可の判定（実装）

- **どの操作にどの権限キーが要るか**: `src/domain/value-objects/admin-permission.ts` の `AdminPermission.requiredFor(<操作>)`。業務ルールのため domain に置く。未知の操作は例外にする
- **今のセッションがその権限を持つか**: `src/lib/auth/admin-permission.ts` の `requireAdminPermission(<権限キー>)`。次のどれかに当たれば `AdminPermissionDeniedError` を投げる（fail closed）。`reason` で理由を返すので、呼び出し側（admin の layout・page・Server Action）がリダイレクト・404 等に変える
  - `unauthenticated`: セッションが無い
  - `not_admin_organization`: アクティブな組織が運営組織（`CLERK_ADMIN_ORGANIZATION_ID`）でない。法人会員の組織で同じ名前の権限を持っていても拒否する
  - `forbidden`: Clerk の `has({ permission })` が偽（未知のロール・その権限を付けていないロール・Clerk に無い権限キー）。カスタム権限の形式でない権限キー（`org:sys_` のシステム権限を含む）も、`has()` を呼ばずに拒否する。システム権限は運営組織の全員に付くため
  - `CLERK_ADMIN_ORGANIZATION_ID` が未設定なら、設定の誤りとして例外にする（誰も許可しない）

```ts
import { AdminPermission } from "@/domain/value-objects/admin-permission";
import { requireAdminPermission } from "@/lib/auth/admin-permission";

await requireAdminPermission(AdminPermission.requiredFor("cancelOrder").key);
```

`src/lib/` は domain を使わない（`docs/ai-prompts/architecture.md`）ため、判定関数は権限キーの文字列を受け取る。権限キーは必ず `AdminPermission.requiredFor()` から取り、文字列で直接書かない。Clerk に `src/domain/` に無い権限が付いていれば検査のスクリプトが失敗する。

## Clerk の設定と検査

ロール・権限・Role Set は Clerk の Backend API で作る。手作業でダッシュボードから作らず、権限マトリクスから作るスクリプトを使う（付け間違いを防ぐため）。開発（dev）とステージング（stg）は同じ Clerk の開発インスタンスを使うため、設定は1回で両方に効く。

| 環境     | Clerk のインスタンス | 状態                                                                                                                    |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| dev・stg | 開発インスタンス     | 2026-11-23 に設定済み（#390）。運営組織「EQ×Mart 運営」                                                                 |
| prod     | 本番インスタンス     | 未設定。本番インスタンスを作るときに下の手順で行う（[#244](https://github.com/wknd-studio/brand-closed-ec/issues/244)） |

手順（本番は config を `prod` に読み替える）:

1. `doppler run -c dev -- pnpm tsx scripts/clerk-admin-rbac.ts setup` を実行する。権限マトリクスから、カスタム権限・3ロール（各ロールに表の ✅ の権限）・運営組織専用の Role Set `role_set:operations` を作り、`CLERK_ADMIN_ORGANIZATION_ID` が未設定なら運営組織をこの Role Set で作って ID を出す。何度実行しても同じ結果になる（足りないものだけ作り、ロールの権限を表どおりに付け直す）
2. 出た運営組織の ID を Doppler の `CLERK_ADMIN_ORGANIZATION_ID` に入れる（dev・stg の両方。stg の値は次のデプロイで Worker に上がる。`docs/cicd.md`）
3. `task clerk:admin-rbac:check`（本番は `doppler run -c prod -- pnpm tsx scripts/clerk-admin-rbac.ts check`）が通ることを確かめる
4. 運営スタッフを運営組織に追加する（Clerk Dashboard の組織のメンバー。ロールは3つのどれか）。`admin_users`・`admin_memberships` へは Clerk Webhook でミラーされる

検査（`check`）は、運営組織の Role Set のロールと各ロールの権限を Clerk から読み、この権限マトリクス・`src/domain/` の権限キーと比べて、次のどれかがあれば失敗する。権限マトリクスを変えたら `setup` を実行し直し、`check` を通す。

- 権限の付け間違い・付け忘れ（システム権限 `org:sys_*` が付いている場合を含む）
- 権限マトリクスと `src/domain/` の権限キーのずれ
- 運営組織の Role Set にある、権限マトリクスに無いロール（未知のロール）・権限マトリクスにあって Clerk に無いロール
- 運営者のロールが、顧客の組織用の Role Set（`role_set:default` 等）にも入っている
- 運営組織の Role Set に無いロール（顧客の組織の `org:admin` 等）に、権限マトリクスの権限が付いている

`setup` は表に無い権限を運営者のロールから外すため、Clerk のシステム権限（`org:sys_*`）も付かない。運営組織のメンバーの追加・削除・ロール変更は Clerk Dashboard で行い、アプリの `<OrganizationProfile />` 等からは行わない前提

## 他コンテキストとの関係

### Clerkとの役割分担

`db-schema-redesign.md`の設計原則7（「認可（RBAC）はClerkが正、Supabaseは所属とロールキーの最小限ミラーに留める」）に従う。

- **Clerk**: ロール・権限の定義そのもの（何のロールがあり、どんな権限を持つか）を運営組織専用のRole Set（顧客組織のRole Setとは別）で管理する
- **Supabase**: 「誰がどのロールキーか」という参照情報のみを`admin_users`/`admin_memberships`にミラーする
- **アプリケーション層**: 実際の認可判定（`has({ permission })`）を行う。未知のロールキーはデフォルトで権限なしとして扱う（fail closed）

RLSは`get_current_admin_user_id()`（`get_current_user_id()`と対になる関数、SECURITY DEFINER）による本人のロール参照SELECTポリシーのみを持ち、他の顧客向けテーブル（`orders`等）への運営者の書き込みはRLSポリシーではなく管理画面API（service role経由）に一本化する。理由は`db-schema-redesign.md`の「RLSポリシー方針への影響」を参照。

### 会員側の法人RBACとの違い（混同注意）

顧客企業の`organizations`/`organization_memberships`（`clerk_role`が`org:admin`/`org:member`）とは、以下の理由で意図的に完全分離されている（FKで繋がない）。

1. `organizations`は顧客の請求主体（`invoice_registration_number`必須・`rank_code`・`stripe_customer_id`等）として設計されており、運営組織を同じテーブルで表現すると無関係な制約に縛られる
2. `organization_memberships.clerk_role`は元々`org:admin`/`org:member`の2値を想定しており、「発注作業のみ」のようなカスタムロールとは前提が異なる

法人会員内の権限（`org:admin`/`org:member`）は本格的な法人組織対応が未実装のVer1時点では注文フローに影響しない（2026-09-13、法人組織内の注文承認フローは廃止。[[ordering]]参照）。本ドキュメントの運営者ロールとは無関係。

### 各コンテキストからの参照のされ方

- [[membership]]: 招待コードの発行・無効化・会員の停止/強制退会は管理者ロールのみが実行できる（権限マトリクス参照）。実行の可否判定にこのドキュメントの権限マトリクスを参照する
- [[ordering]]: 注文キャンセル・請求書発行・注文ステータス更新の可否は、ロールによって権限マトリクスの通りに分岐する
- [[procurement]]: 調達担当が担う発注作業の権限範囲の根拠になる
- [[fulfillment]]: 調達担当が担う出荷作業の権限範囲の根拠になる
- [[returns]]: **返品・返金の承認は管理者ロールのみに限定する（2026-09-14確定、2026-09-20権限マトリクスに反映済み）**。旧`archive/operations-order.md`の運用（`paid`以降のキャンセルは管理者のみ）を踏襲し、請求・顧客担当等には開放しない

## 参考資料

- `docs/db-schema-redesign.md` の「管理者RBAC・会員側法人RBACへの対応方針」節、「ロールのバリデーションについて」節、`admin_users`/`admin_memberships`テーブル定義節、「RLSポリシー方針への影響」節
- （旧`docs/archive/service-spec.md`「利用者」節・「運営者ロール」節を材料に執筆。ドメインドキュメント全体完了に伴いarchiveは削除済み）
- 実装: `admin_users`/`admin_memberships`は[#218](https://github.com/wknd-studio/brand-closed-ec/issues/218)でマイグレーション・`get_current_admin_user_id()`・Clerk Webhookミラーリングまで実装済み（`supabase/migrations/20260922050000_create_admin_users_admin_memberships.sql`）。Clerk側の運営組織作成・カスタムロール/権限の命名確定・アプリ層の`has({ permission })`による判定は[#390](https://github.com/wknd-studio/brand-closed-ec/issues/390)で実装済み（既存の管理画面の置き換えは[#391](https://github.com/wknd-studio/brand-closed-ec/issues/391)）
