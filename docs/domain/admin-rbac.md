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

| 用語               | 定義                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **運営スタッフ**   | 運営組織に所属するClerkアカウント。会員（顧客）とは別の集約として管理される。DB上は`admin_users`で表現する                                                                                                      |
| **運営組織**       | 御社（運営会社）自身を表すClerk Organization。現時点では1つのみを前提とする。顧客企業の`organizations`（法人会員）とは完全に別の概念                                                                            |
| **ロールキー**     | 運営スタッフのロールの識別子（`ops_admin`・`ops_billing`・`ops_procurement`。「権限マトリクス」の列の見出し）。Supabase の`admin_role_assignments.role`に持つ。Clerk の組織のロール（`org:admin` 等）とは無関係 |
| **管理者**         | 全機能にアクセスできる運営者ロール。担当者アカウントの管理も担う                                                                                                                                                |
| **請求・顧客担当** | 請求書の発行・会員からの問い合わせ対応を担う運営者ロール                                                                                                                                                        |
| **調達担当**       | 仕入れ先への発注・注文ステータスの更新を担う運営者ロール                                                                                                                                                        |
| **権限キー**       | 運営者の操作ごとの許可の識別子（`orders:cancel` 等。「権限マトリクス」の権限キーの列）。`src/domain/value-objects/admin-permission.ts` に持ち、DB にも Clerk にも持たない                                       |

## 業務ルール・不変条件

### 確定しているもの

- **3ロール制**: 管理者・請求顧客担当・調達担当の3種類。権限マトリクスは`archive/service-spec.md`の「運営者ロール」に定義済み（本ドキュメントの「権限マトリクス」セクションに転記）
- **運営組織は1つだけ**: 複数の運営組織（例: 外部委託先3PL等）が必要になる具体的な要件が今のところ無いため、`admin_organizations`テーブルは持たない。1運営スタッフ（`admin_users`）は常に1ロール（`admin_role_assignments`）しか持てない（`admin_role_assignments.admin_user_id`が主キー）
- **顧客と運営スタッフは別集約**: 同じ人物が会員（`users`）と運営スタッフ（`admin_users`）を兼ねることは許容するが、DB上は別テーブル・別行として扱う。`users`は`rank_code`等の顧客専用列を必ず持つため、運営スタッフをそこに混ぜると無意味な既定値を持たせることになる
- **ロールと権限はアプリが正、Clerk には持たない**（2026-11-23変更、#390）: 「どんなロールがあり、どんな権限を持つか」はコードの権限マトリクス（`src/domain/value-objects/admin-role.ts`）が正で、「誰がどのロールか」は Supabase の`admin_role_assignments`に持つ。Clerk のカスタムロール・カスタム権限・Role Set は、本番（Pro）では追加のプラン（B2B Authentication、月 $100）が要るため使わない。運営組織のメンバーは Clerk の標準のロール（`org:admin`/`org:member`）のままにし、そのロールは判定に使わない。将来 Supabase Auth に移す可能性があるため、ロールと権限を認証基盤に依存させない
- **認可判定はアプリケーション層**: 「このスタッフはこの操作ができるか」は、アプリケーション層が「運営組織のメンバーである（Clerk のセッション）」かつ「DB のロールがその権限を持つ（コードの権限マトリクス）」で判定する（「認可の判定（実装）」）。RLS では判定しない
- **書き込み経路**: `admin_users`/`admin_memberships`へのINSERT/UPDATE/DELETEは、Clerkの`organizationMembership.*`等のWebhookイベント経由のミラーリングに限定する。メンバーの追加・削除は必ずClerk側（Dashboard/Backend API）で行う。`admin_role_assignments`（ロール）はアプリから書き込む経路を持たず、運営が SQL で付与・変更・取り消しする（「ロールの付与」）
- **ロールキー・権限キーの命名**（2026-11-23確定、#390）: ロールキーは `ops_<ロール>`（`ops_admin`・`ops_billing`・`ops_procurement`）、権限キーは `<対象>:<操作>` で、権限マトリクスの1行 = 1権限キーにする。Clerk の形式（`org:` で始まる）にはしない
- **`clerk_role`にCHECK制約は付けない・`admin_role_assignments.role`には付ける**: `admin_memberships.clerk_role`は Clerk の組織のロールのミラーで判定に使わないため、値を縛らない。`admin_role_assignments.role`は判定に使うため3ロールの CHECK を付け、ロールを増減するときはマイグレーションとコードの権限マトリクスを一緒に変える。アプリも未知のロールは権限なしとして扱う（fail closed）

### まだ決まっていない・要確認事項

- 🔲 運営スタッフが管理画面に入ったときに運営組織をアクティブにする方法（[#391](https://github.com/wknd-studio/brand-closed-ec/issues/391) で決める）。判定は Clerk のセッションでアクティブな組織が運営組織かを見るため、アクティブでなければ拒否する。候補は、admin の layout でアクティブな組織が運営組織でなければ Client Component から `setActive({ organization })` で切り替える方法（`clerkMiddleware` の `organizationSyncOptions` はURLに組織のslug・IDを含める必要があるため合わない）
- 🔲 運営スタッフのロールを付与・変更する管理画面を作るか（今は作らず、SQL で付与する。「ロールの付与」）
- 🔲 Clerk Webhookの受信ログ・べき等性の仕組みを、`stripe_webhook_events`と同様にClerk Webhookにも用意するかは実装時の検討事項（`db-schema-redesign.md`より）
- 🔲 Clerk の運営組織から外れたスタッフの`admin_role_assignments`の行を消すか（判定は運営組織のメンバーであることも見るため、行が残っても許可されない。再加入したときにロールが戻る）
- 🔲 将来、運営組織を複数に分ける場合の移行手順（`admin_organization_id`カラム追加を想定した拡張ポイントはある。「参考資料」参照）

## 権限マトリクス

`archive/service-spec.md`から転記した旧マトリクスを土台に、2026-09-14〜20の一連の設計変更（決済単位の分離・法人組織の注文承認フロー廃止・調達/配送/返品の各フェーズ確定）を反映して全面更新。

この表は、コードの権限マトリクス（`src/domain/value-objects/admin-role.ts`）を人が読むための写し。両者が一致することを `tests/unit/admin-role.test.ts` が確かめるため、変えるときは両方を直す。

| 機能                                                             | 権限キー                        | 管理者（`ops_admin`） | 請求・顧客担当（`ops_billing`） | 調達担当（`ops_procurement`） |
| ---------------------------------------------------------------- | ------------------------------- | :-------------------: | :-----------------------------: | :---------------------------: |
| 会員の停止・停止解除                                             | `members:suspend`               |          ✅           |                —                |               —               |
| 会員の強制退会                                                   | `members:force_withdraw`        |          ✅           |                —                |               —               |
| 招待コード発行・無効化                                           | `invitation_codes:manage`       |          ✅           |                —                |               —               |
| 会員一覧・詳細閲覧                                               | `members:read`                  |          ✅           |               ✅                |               —               |
| 会員の招待ステータス設定                                         | `members:set_invitation_status` |          ✅           |                —                |               —               |
| 商品の登録・編集・削除（Sanity Studio）                          | `products:manage`               |          ✅           |                —                |              ✅               |
| 注文一覧・詳細閲覧                                               | `orders:read`                   |          ✅           |               ✅                |              ✅               |
| 注文キャンセル（決済単位が1件も作られる前）                      | `orders:cancel`                 |          ✅           |               ✅                |               —               |
| 請求作成（後払い明細を選んでInvoiceを発行）                      | `invoices:create`               |          ✅           |               ✅                |               —               |
| 決済単位のキャンセル（`limit_exceeded`からの回復・保留分の取消） | `settlements:cancel`            |          ✅           |               ✅                |               —               |
| 発注タスクの着手・発注確定（[[procurement]]）                    | `procurement:manage`            |          ✅           |                —                |              ✅               |
| 入荷検品の記録（明細単位の`received_at`）                        | `receiving:record`              |          ✅           |                —                |              ✅               |
| 出荷の着手・発送記録（[[fulfillment]]）                          | `shipments:manage`              |          ✅           |                —                |              ✅               |
| 配達完了の記録                                                   | `deliveries:record`             |          ✅           |                —                |              ✅               |
| **返品・返金の承認・却下・返金実行**（2026-09-14確定）           | `returns:manage`                |          ✅           |                —                |               —               |
| お知らせ投稿                                                     | `announcements:manage`          |          ✅           |                —                |               —               |
| 担当者アカウント管理                                             | `staff:manage`                  |          ✅           |                —                |               —               |

「担当者アカウント管理」＝運営スタッフの追加・削除・ロール変更の指示権限を指す。この操作自体は管理者ロールのみに許可されるが、今は管理画面が無く、追加・削除の入り口はClerk Dashboard（DBはWebhookでミラーするだけ）、ロールの付与は SQL である点に注意（「ロールの付与」参照）。

**返品・返金の承認を管理者のみに限定する理由**: 返金はお金が動く例外対応であり、御社は顧客都合のキャンセル・返品を原則不可としているため（[[returns]]参照）、権限を請求・顧客担当まで広げる理由がない。旧`archive/operations-order.md`の運用（`paid`以降のキャンセルは管理者のみ）をそのまま踏襲する。

## 認可の判定（実装）

- **どの操作にどの権限キーが要るか**: `src/domain/value-objects/admin-permission.ts` の `AdminPermission.requiredFor(<操作>)`。未知の操作は例外にする
- **どのロールがどの権限を持つか**: `src/domain/value-objects/admin-role.ts` の `AdminRole.grants(<権限>)`（コードの権限マトリクス）。未知のロールは `AdminRole.parse()` が null を返し、権限なしになる
- **今のセッションがその権限を持つか**: `src/composition/admin-authorization.ts` の `requireAdminPermission(<権限>)`（実装は `src/infrastructure/supabase/supabase-admin-authorization.ts`）。次のどれかに当たれば `AdminPermissionDeniedError`（`src/lib/auth/admin-organization.ts`）を投げる（fail closed）。`reason` で理由を返すので、呼び出し側（admin の layout・page・Server Action）がリダイレクト・404 等に変える
  - `unauthenticated`: セッションが無い
  - `not_admin_organization`: アクティブな組織が運営組織（`CLERK_ADMIN_ORGANIZATION_ID`）でない。組織に属さない人・法人会員の組織がアクティブな人は、DB にロールがあっても拒否する
  - `forbidden`: 運営組織のメンバーだが、`admin_users`の行が無い・`admin_role_assignments`にロールが無い・そのロールが権限を持たない
  - `CLERK_ADMIN_ORGANIZATION_ID` が未設定なら、設定の誤りとして例外にする（誰も許可しない）

```ts
import { AdminPermission } from "@/domain/value-objects/admin-permission";
import { requireAdminPermission } from "@/composition/admin-authorization";

await requireAdminPermission(AdminPermission.requiredFor("cancelOrder"));
```

Clerk に依存するのは「運営組織のメンバーか」（`src/lib/auth/admin-organization.ts`）と、`admin_users.clerk_user_id`での運営スタッフの特定だけ。Supabase Auth に移すときはこの2か所を差し替え、ロール・権限・`admin_role_assignments`はそのまま使える。

## 運営組織の設定（Clerk）

運営組織は Clerk の組織（Pro で使える。メンバーは20人まで）で、Clerk の標準のロールのままにする。カスタムロール・カスタム権限・Role Set は作らない。ローカル（dev）・ステージング（stg）・CI・本番で Clerk のインスタンスが分かれている（`docs/cicd.md`）ため、運営組織と`CLERK_ADMIN_ORGANIZATION_ID`はインスタンスごとにある。

| 環境     | Clerk のインスタンス                               | 状態                                                                                                                                            |
| -------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| dev・stg | ローカル用・stg 用のインスタンス（`docs/cicd.md`） | 運営組織「EQ×Mart 運営」をそれぞれ作成済み（2026-11-23、#390）。Doppler の dev・stg の`CLERK_ADMIN_ORGANIZATION_ID`に、それぞれの ID を設定済み |
| prod     | 本番インスタンス                                   | 未設定。本番インスタンスを作るときに下の手順で行う（[#244](https://github.com/wknd-studio/brand-closed-ec/issues/244)）                         |

手順:

1. Clerk Dashboard の Organizations で運営組織（「EQ×Mart 運営」）を作る。作成者（自分）がメンバーになってよい。Organizations の機能が無効のインスタンス（2026-11-23 時点の本番）では、先に Configure → Organizations で有効にする
2. 組織の ID（`org_...`）を Doppler の`CLERK_ADMIN_ORGANIZATION_ID`に入れる（`docs/cicd.md`。値はパイプで渡し画面に出さない）
3. 運営スタッフを運営組織のメンバーに追加する（Clerk Dashboard。Clerk のロールは `org:member` でよい）。`admin_users`・`admin_memberships`へは Clerk Webhook でミラーされる
4. 運営のロールを付与する（「ロールの付与」）

## ロールの付与

管理画面は作らず、Supabase の SQL エディタ（stg・prod は Supabase Dashboard、ローカルは Studio）で service role として実行する。先に運営組織のメンバーに追加し、Webhook で`admin_users`の行ができていることを確かめる。

```sql
-- 付与・変更（ロールは ops_admin / ops_billing / ops_procurement のどれか）
INSERT INTO public.admin_role_assignments (admin_user_id, role)
SELECT id, 'ops_billing' FROM public.admin_users WHERE email = 'staff@example.com'
ON CONFLICT (admin_user_id) DO UPDATE SET role = EXCLUDED.role;

-- 取り消し
DELETE FROM public.admin_role_assignments
WHERE admin_user_id = (SELECT id FROM public.admin_users WHERE email = 'staff@example.com');

-- 確認
SELECT u.email, r.role, r.updated_at
FROM public.admin_role_assignments r JOIN public.admin_users u ON u.id = r.admin_user_id;
```

`INSERT` が0行なら`admin_users`の行が無い（Webhook が届いていない・メールアドレスの誤り）。運営組織から外すと判定で拒否されるが、ロールの行は残る（再加入したときに同じロールになる。要らなければ取り消す）。

## 他コンテキストとの関係

### Clerkとの役割分担

`db-schema-redesign.md`の設計原則7（「認可（RBAC）はClerkが正」）は、2026-11-23（#390）に次のとおり変えた。Clerk のカスタムロールが本番で追加のプランを要するため。

- **Clerk**: 認証と、運営組織のメンバーであること（標準のロールのまま）
- **Supabase**: 「誰が運営スタッフか」（`admin_users`/`admin_memberships`。Webhook のミラー）と「誰がどのロールか」（`admin_role_assignments`）
- **アプリケーション層**: ロール → 権限の対応（コードの権限マトリクス）と、認可の判定。未知のロールは権限なしとして扱う（fail closed）

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
- 実装: `admin_users`/`admin_memberships`は[#218](https://github.com/wknd-studio/brand-closed-ec/issues/218)でマイグレーション・`get_current_admin_user_id()`・Clerk Webhookミラーリングまで実装済み（`supabase/migrations/20260922050000_create_admin_users_admin_memberships.sql`）。運営組織の作成・ロールキー/権限キーの命名確定・`admin_role_assignments`・アプリ層の判定は[#390](https://github.com/wknd-studio/brand-closed-ec/issues/390)で実装済み（`supabase/migrations/20261123080524_create_admin_role_assignments.sql`）（既存の管理画面の置き換えは[#391](https://github.com/wknd-studio/brand-closed-ec/issues/391)）
