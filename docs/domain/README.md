# ドメインドキュメント計画書

> **これは索引であると同時に進行管理表。新しいセッションはこのファイルだけ読めば、何を・どの順で・どう書けばいいか分かる状態を維持する。**

## 目的

`docs/db-schema-redesign.md`の設計（発注管理・分割出荷・返品返金・運営者RBACの新設）をきっかけに、「業務知識が特定の会話・特定の人の頭の中にしかない」状態を解消するため、サービス全体の業務ドメインを**境界づけられたコンテキストごと**にドキュメント化する。

## `specs/`との違い（重要・混同しないこと）

- `specs/NNN-topic/spec.md` … **「これから何を変えるか」**の提案書（spec-kit管理、機能追加のたびに増える）
- `docs/domain/*.md` … **「今、業務はどう定義されているか」**の現在地（頻繁には変わらない、DDD的な境界づけられたコンテキストのドキュメント）

新しく`spec.md`を書くときは、業務知識を再説明せず`docs/domain/*.md`にリンクするだけにする。逆に、spec作業中に業務ルールの誤り・不足に気づいたら、そのタイミングで対応する`docs/domain/*.md`を更新する（都度直さず、気づいた時にまとめて反映でよい）。

## 各ファイルの書き方（統一フォーマット）

1. **このコンテキストの責務**（何を扱い、何を扱わないか）
2. **主要な概念・用語**（ユビキタス言語。既存の`docs/glossary.md`と矛盾させない。新しい用語はここで定義し、`glossary.md`側にも追記する）
3. **業務ルール・不変条件**（確定しているもの／まだ決まっていないもの・要確認事項は明示的に分けて書く。「未確定」を隠さない）
4. **他コンテキストとの関係**（どこまでが自分の責務で、どこから先は別のコンテキストに任せるか。関連ファイルへのリンク）
5. **参考資料**：対応する`db-schema-redesign.md`のテーブル、関連する`specs/`、実装済みの場合はコードの場所

## ソース資料（既存資料。ゼロから書かず、これらを材料に現状と突き合わせて再構成する）

- `docs/archive/service-spec.md` … サービス概要・利用者・招待・ランク変更・退会・運営者ロール（凍結済み）
- `docs/archive/user-stories.md` … 機能ごとのユーザーストーリー・受け入れ条件（凍結済み）
- `docs/archive/data-model.md` … 旧データモデル（凍結済み。**`db-schema-redesign.md`の方が新しく正確**なので、矛盾する場合は`db-schema-redesign.md`を優先する）
- `docs/archive/order-flow.md` … 旧注文フロー（凍結済み。発注/出荷/返品は含まれていないので今回追記が必要）
- `docs/archive/operations-order.md` … 旧注文対応オペレーション（凍結済み）
- `docs/signup-flow.md` / `docs/plan-change-flow.md` / `docs/waitlist-migration-plan.md` … 現行の会員登録・プラン変更まわり
- `docs/glossary.md` … 用語集（現行）
- `docs/db-schema-redesign.md` … 今回のスキーマ再設計（最新の正）
- `specs/001-seven-rank-pricing`, `specs/003-checkout-invoice-e2e`, `specs/004-split-order-payment-timing`, `specs/005-b2b-organization` … 各機能の実装済みspec

## 進捗表

作業を始める前に自分の担当行を `⏳ 作業中（担当: <目印>）` に変更し、終わったら `✅ 完了` にする。**同じファイルを複数セッションで同時に書き始めない**（下記「並行作業の進め方」参照）。

| ファイル                  | 内容                                             | 主なソース                                                                                                                      | 状態                                   |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `membership.md`           | 会員登録（招待制）・個人/法人・退会              | `archive/service-spec.md`, `signup-flow.md`, `waitlist-migration-plan.md`                                                       | ✅ 完了                                |
| `subscription-billing.md` | ランク・サブスクリプション・初期費用・プラン変更 | `archive/service-spec.md`, `plan-change-flow.md`, `specs/001-seven-rank-pricing`                                                | ✅ 完了                                |
| `catalog.md`              | 商品カタログ・ブランド・在庫・手配リクエスト     | `glossary.md`, `archive/service-spec.md`（Sanity側）                                                                            | ✅ 完了                                |
| `ordering.md`             | カート・注文・Checkout/Invoice・法人承認         | `archive/order-flow.md`, `specs/003-checkout-invoice-e2e`, `specs/004-split-order-payment-timing`, `specs/005-b2b-organization` | ⏳ 作業中（担当: claude-code-session） |
| `procurement.md`          | 発注管理（新設）                                 | `db-schema-redesign.md`（procurement_tasks節）, `archive/operations-order.md`                                                   | ✅ 完了                                |
| `fulfillment.md`          | 配送・分割出荷・配送ルート（新設）               | `db-schema-redesign.md`（shipments/locations節）                                                                                | ⬜ 未着手                              |
| `returns.md`              | 返品・返金（新設）                               | `db-schema-redesign.md`（returns/return_items節）                                                                               | ⬜ 未着手                              |
| `admin-rbac.md`           | 運営者権限管理（新設）                           | `db-schema-redesign.md`（admin_users/admin_memberships節）, `archive/service-spec.md`「運営者ロール」                           | ✅ 完了                                |

全ファイル完了後、`docs/overview.md`のリンクを`docs/domain/*.md`へ張り替え、`docs/archive/*.md`は役目を終える（削除するかは完了時に判断）。

## 並行作業の進め方（複数セッションで同時に進める場合）

1. 新しいセッション（`/clear`後、または新しいターミナルで`claude`起動）で、まず**このファイルを読む**よう指示する
2. 上の進捗表からまだ`⬜ 未着手`の行を1つ選び、その行を`⏳ 作業中`に変更してコミットする（他セッションとの重複着手を防ぐ）
3. `feature/docs-domain-<topic>`ブランチを`develop`最新から切る（例: `feature/docs-domain-membership`）。CLAUDE.mdのブランチ戦略に従う
4. ソース資料を読み込み、上記フォーマットで`docs/domain/<topic>.md`を書く
5. 書き終えたら進捗表を`✅ 完了`にし、`develop`向けにPRを作成する
6. 1ファイル＝1PR（`membership.md`と`procurement.md`を同じPRに混ぜない）。複数セッションが同時に走っても、担当ファイルが別なら衝突しない

### 依存関係の注意

`procurement.md`/`fulfillment.md`/`returns.md`/`admin-rbac.md`の4つは相互に用語（`procurement_tasks`, `shipments`, `locations`等）を参照し合うため、**できれば先に1つ（`admin-rbac.md`推奨）を書き終えてから残り3つに着手する**と用語の揺れが起きにくい。`membership.md`/`subscription-billing.md`/`catalog.md`/`ordering.md`は既存実装の整理が中心なので、上記4つと並行して進めても問題ない。

## 起動プロンプト例（新セッションにそのままコピペしてよい）

```
docs/domain/README.md を読んで、進捗表からまだ未着手のファイルを1つ選び、
その担当として docs/domain/<ファイル名> を書いてください。
進め方・フォーマット・ソース資料は README.md の記載に従ってください。
着手前に進捗表の該当行を「⏳ 作業中」に更新してからブランチを切ってください。
```
