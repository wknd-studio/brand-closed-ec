# 商品カタログ（Catalog）

## このコンテキストの責務

このドキュメントは「会員が仕入れの判断をするために閲覧する商品情報が、どこで・どう管理され、ランクごとに何が見えるか」を定義する。

**扱うこと**:

- 商品マスタ（商品・ブランド・カテゴリ）の管理場所と構造（Sanity CMS）
- ランク制限商品の閲覧可否判定・ランク別仕入れ価格（掛け率）の決定ロジック
- 商品の在庫状況（`availability`）の3値と、閲覧・購入可否への影響
- 要相談商品（個別見積もり）・支払いタイミング（注文時払い／注文後払い）という商品属性
- 業者商品データインポート（CSV・スクレイピング）による商品情報の継続的な更新の位置づけ
- 手配リクエスト（カタログ掲載外商品の取り寄せ依頼）という、現時点では未実装の機能の定義

**扱わないこと**:

- 会員のランクそのものの定義・序列・月次仕入れ上限は[[subscription-billing]]が扱う。本ドキュメントは「ランクが決まっている前提で、そのランクに何が見えるか・いくらか」までを扱う
- カート・お気に入りへの追加操作、注文確定時のスナップショット化（`product_name_snapshot`等）、月間仕入れ上限の消費判定は`ordering.md`（未着手）が扱う。本ドキュメントは「カートに入れる前の、商品そのものの閲覧・価格計算」までを扱う
- 業者商品データインポートの技術的な処理フロー（統一中間スキーマへの変換・JANコード突合・定期実行の仕組み）自体は`specs/004-product-data-import/`が仕様の正であり、本ドキュメントはそれによって何が起きるか（重複判定キー・インポート由来商品の編集制限等）という商品データへの影響のみを扱う
- 発注タスクへのグルーピング（`brand_id_snapshot`を目印にしたまとめ発注）は`procurement.md`が扱う。本ドキュメントは「ブランドとは何か」までを扱い、その先の仕入れ先マスタ・発注運用には立ち入らない

## 主要な概念・用語

`docs/glossary.md`の「商品・カタログ」節の定義を踏まえ、以下を追加で定義する。用語集にも追記が必要（後述）。

| 用語                                   | 定義                                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **要相談商品**                         | 価格が個別見積もりとなる商品（`is_negotiable`）。ランク別価格を持たず、Invoiceフロー（注文後払い）でのみ扱われる                                                                                                                       |
| **支払いタイミング**                   | 商品ごとに設定する決済方式（`payment_timing`）。注文時払い（`at_order`、Stripe Checkoutで即時決済）と注文後払い（`after_order`、運営者確認後にInvoice発行）の2種類。要相談商品は必ず注文後払いに固定される                             |
| **掛け率設定**                         | ランク別掛け率のプリセット（`priceSettings`）。商品個別の掛け率 → アタッチされたブランドの掛け率設定 → 全体のデフォルト掛け率設定（`is_default`が1件のみ存在）の優先順で解決される                                                     |
| **仕入れ掛け率（`vendor_cost_rate`）** | 業者から提示された、定価に対する仕入れ支払い比率。運営者専用の内部情報で会員には見せず、ランク別価格が仕入れ値を下回っていないかの下限チェックにのみ使う                                                                               |
| **データ取得元（`source_catalog`）**   | 業者商品データインポート（`specs/004-product-data-import`）によって作成・更新された商品が持つ、取得元業者カタログへの参照。この値が設定されている商品はJANコード・仕入れ掛け率が編集不可になる（突合キー・来歴情報の整合性を保つため） |
| **手配リクエスト**                     | カタログ掲載外の商品の取り寄せ依頼機能。`docs/glossary.md`に用語定義はあるが、本ドキュメント執筆時点でDBテーブル・画面とも未実装（詳細は「まだ決まっていない・要確認事項」参照）                                                       |

## 業務ルール・不変条件

### 確定しているもの

**商品マスタの置き場所**

- 商品・ブランド・カテゴリはすべて Sanity CMS で管理し、Supabase には商品テーブルを持たない（ADR-005）。Supabase 側（`cart_items`/`favorites`/`order_items`）は `sanity_product_id`（TEXT）で Sanity のドキュメントを参照するのみで、商品データを複製しない
- 商品登録・編集・削除は Sanity Studio 上でのみ行う。運営者ロールのうち管理者・調達担当のみがこの操作を許可される（[[admin-rbac]]の権限マトリクス「商品の登録・編集・削除（Sanity Studio）」）

**ランク制限とアクセス可否**

- 商品は`min_rank`（最低閲覧ランク）を持つ。会員は自分のランク以上の`min_rank`が設定された商品を閲覧できない（一覧に表示されず、詳細URLへの直接アクセスは404）
- ランク比較は[[subscription-billing]]が定義するランク序列（STARTER〜ENTERPRISEの7段階、`RANK_ORDER`）のインデックス比較で行う（実装: `isProductAccessible()` / `getAllowedRanks()`、`src/lib/sanity/products.ts`）
- 商品にファイルが添付されている場合も同じアクセス制御に従う（閲覧不可な会員には404）

**ランク別価格の決定**

- 固定価格商品（`is_negotiable`が false）は、ENTERPRISEを除く6ランクすべての価格入力が必須。ENTERPRISEは個別契約のため価格入力の対象外（[[subscription-billing]]と同じ理由でセルフサービス外）
- ランク別仕入れ価格（`prices`）は掛け率（`price_rates`）から自動計算される読み取り専用フィールドであり、直接編集はできない
- 掛け率は「商品個別の`price_rates`」→「商品にアタッチされた`price_settings`」→「ブランドにアタッチされた`price_settings`」→「`is_default=true`の`priceSettings`（全体で1件のみ存在できる）」の優先順で解決される
- 仕入れ掛け率（`vendor_cost_rate`）が設定されている場合、`定価 × 仕入れ掛け率`を下回るランク価格は赤字になるため保存時にブロックされる（`validatePrices()`、`specs/004-product-data-import`由来のルール）
- 要相談商品はランク別価格を持たず、価格未入力のまま保存できる。支払いタイミングは`after_order`に固定される（注文時払いとの組み合わせは保存時にバリデーションエラー）

**在庫状況（`availability`）**

- 在庫状況は数量ではなく3値の列挙型: `available`（取り扱い中）／`out_of_stock`（在庫切れ）／`discontinued`（取り扱い終了）
- `discontinued`の商品は一覧・ブランド集計から常に除外される（`availability!="discontinued"`のGROQフィルタ）
- `out_of_stock`の商品は一覧には表示されるが、カート追加ボタンが非活性になる（数量指定によらず購入不可）
- カート・お気に入りはSupabaseの`cart_items`/`favorites`テーブルに`sanity_product_id`で参照を持つのみ。`UNIQUE (user_id, sanity_product_id)`制約により同じ商品の重複登録はできず、数量を1行に集約する

**業者商品データインポートとの関係**

- `source_catalog`が設定されている商品（インポート由来）は、JANコード（重複判定キー）と仕入れ掛け率が編集不可になる。修正が必要な場合は再インポートで上書きする運用（突合キーの整合性を保つため）
- インポート処理は定期実行され、価格・在庫状況を継続的に更新する。情報源から消えた商品は自動で`discontinued`にはならず、「要確認」状態を経て担当者の承認が必要（`specs/004-product-data-import` User Story 3）

### まだ決まっていない・要確認事項

- 🔲 **手配リクエスト機能そのものが未実装**: `docs/glossary.md`には「カタログ掲載外の商品の取り寄せ依頼機能。全ランク共通で利用できる」という定義があり、`archive/service-spec.md`の「利用者」節にも会員の利用可能機能として挙げられているが、DBテーブル・API・画面のいずれも存在しない。受け入れ条件を定めた`user-stories.md`のストーリーも存在しない。実装するかどうか・するとしてどんなフローか（見積もり依頼→運営者確認→Invoiceのような流れになるかは要相談商品と同様の設計になりうる）は未確定
- 🔲 **数量ベースの在庫管理・ソフト予約は未実装**: `docs/glossary.md`は「在庫数」「ソフト予約（カート追加時点で仮確保し、決済完了で確定・キャンセルで解放）」を定義し、`archive/user-stories.md`（旧5ランクモデル時代）にも`inventory.reserved`のインクリメントを前提とした受け入れ条件があるが、現行のSanity `product`スキーマには`available`/`out_of_stock`/`discontinued`の3値`availability`しかなく、数量そのもの・予約数を保持するフィールドが存在しない。複数会員が同時に同じ在庫切れ間際の商品をカートに入れた場合の競合制御は現状仕組みがない。用語集の記述と実装が乖離しているため、どちらを正とするか（数量管理を実装するか、用語集側を3値運用に合わせて更新するか）の判断が必要
- 🔲 **ブランドと一次卸業者の対応関係**: `procurement.md`の「参考資料」で触れられている通り、1ブランドが複数卸業者から仕入れられるのか、1卸業者が複数ブランドを扱うのかという前提を置いていない。現状はスタッフが発注タスク作成時に手動でグルーピングする運用で回避しているが、将来的に卸業者マスタ（`suppliers`テーブル）を新設するかは未定
- 🔲 **商品一覧のカテゴリ絞り込み・並び替え・検索の詳細仕様**: `archive/user-stories.md`のPROD-01〜PROD-06に受け入れ条件の記載があるが、これは旧5ランクモデル（Free/Entry/Standard/Pro/Enterprise）時代に書かれたものであり、現行の7ランクモデル・実装（`src/lib/sanity/products.ts`は新着順・ブランド絞り込みのページネーションのみを実装済み）とどこまで整合しているかは未検証。特に「無限スクロール1回あたりの件数」「検索実行タイミング」はTBDのまま
- 🔲 **お気に入り一覧の表示項目・ランク制限で閲覧不能になった商品の扱い**: `archive/user-stories.md`のFAV-02でTBDのまま残っている

## 他コンテキストとの関係

### [[subscription-billing]]との境界

会員の現在ランク・ランク序列の定義そのものは[[subscription-billing]]の責務。本ドキュメントはそのランクを受け取って「このランクにこの商品が見えるか・いくらか」を判定する側（`isProductAccessible()`・`prices`）に閉じる。ENTERPRISEランクが個別契約であるためセルフサービスの価格設定対象外という前提も[[subscription-billing]]と共通する。

### `ordering.md`（未着手）との境界

- カート・お気に入りへの追加そのもの、月間仕入れ上限を超える場合のエラー表示、注文確定時の商品名・単価・ブランドのスナップショット化（`product_name_snapshot`/`unit_price_snapshot`/`brand_id_snapshot`/`brand_name_snapshot`）は`ordering.md`が扱う。本ドキュメントはスナップショット元となる商品データそのものの管理までを扱う
- 商品ごとの`fulfillment_location_code`（事務所経由／仕入れ先直送）は商品属性としてはSanity側にあるが、注文時にどうスナップショットされ発送ルートにどう影響するかは`ordering.md`/`fulfillment.md`（いずれも未着手）が扱う

### `procurement.md`との境界

発注タスクは`order_items.brand_id_snapshot`を目印にスタッフが手動でグルーピングする（`procurement.md`参照）。本ドキュメントが定義する「ブランド」はその目印の元データであり、ブランドと一次卸業者の対応関係を前提としないという設計判断は`procurement.md`側の課題として引き継がれている。

### [[admin-rbac]]との境界

商品の登録・編集・削除（Sanity Studio操作）を許可されるロールは管理者・調達担当のみという判定基準は[[admin-rbac]]の権限マトリクスに従う。本ドキュメントはその権限を使って実際に何が編集されるか（商品スキーマの中身）を扱う。

## 参考資料

- `docs/adr/005-sanity-cms.md` — Sanity CMS採用の背景・Supabaseとの役割分担の決定
- 実装（Sanityスキーマ）: `src/sanity/schemas/product.ts`（商品・価格計算・バリデーション）、`brand.ts`、`category.ts`、`price-settings.ts`（掛け率設定プリセット）、`rank-options.ts`（`RANK_OPTIONS`/`PRICING_RANK_OPTIONS`）
- 実装（アプリケーション層）: `src/lib/sanity/products.ts`（`isProductAccessible()`・`getAllowedRanks()`・`fetchProducts()`等）、`src/domain/value-objects/cart-item.ts`
- `docs/db-schema-redesign.md` の`cart_items`（変更なし）節・`favorites`（変更なし）節・`order_items`の`sanity_product_id`/`product_name_snapshot`/`brand_id_snapshot`/`brand_name_snapshot`/`fulfillment_location_code`列の節
- `specs/004-product-data-import/` — 業者商品データの統一インポート基盤の仕様（CSV提供業者・スクレイピング業者・定期実行・JANコード重複判定）。`contracts/unified-product-schema.md`に統一中間スキーマの定義あり
- （旧`docs/archive/service-spec.md`「会員プラン」節・`docs/archive/user-stories.md`「2. 商品閲覧」「2.5 お気に入り」節を材料に執筆。ドメインドキュメント全体完了に伴いarchiveは削除済み）
