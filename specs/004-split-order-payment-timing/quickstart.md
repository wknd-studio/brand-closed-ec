# Quickstart: 商品別支払いタイミング設定とカート分割注文

**Feature**: 004-split-order-payment-timing
**Date**: 2026-07-31

実装完了後、以下の手順でエンドツーエンドに機能を検証できる。詳細な型・関数シグネチャは[data-model.md](./data-model.md)・[contracts/internal-interfaces.md](./contracts/internal-interfaces.md)を参照。

## 前提

- ローカル環境（`task dev`）が起動していること
- Sanity Studio（`task sanity:dev`）で`payment_timing`フィールドが商品編集画面に表示されること
- Supabaseローカルインスタンスにマイグレーション（`split_group_id`列追加）が適用済みであること（`supabase db reset`）

## シナリオ1: 商品ごとの支払いタイミング設定（User Story 1）

1. Sanity Studioで固定価格商品を1件開く
2. `payment_timing`を「注文後払い」に変更して保存できることを確認
3. `is_negotiable`が有効な商品を開き、`payment_timing`を「注文時払い」に変更しようとするとバリデーションエラーになることを確認
4. `is_negotiable`が有効な商品の編集画面で、ランク別価格(`price_rates`・`prices`)の入力欄が表示されないことを確認

**対応する自動テスト**: `tests/unit/sanity/product-payment-timing-validation.test.ts`（新規）

## シナリオ2: 単一タイミングのカート（後方互換、User Story 2の一部）

1. `payment_timing: at_order`の商品のみをカートに入れてチェックアウトする
2. Stripe Checkoutへリダイレクトされ、決済完了後に注文が1件だけ作成されることを確認
3. `payment_timing: after_order`の商品（価格未確定商品含む）のみをカートに入れてチェックアウトする
4. `/order/invoice-complete`へ遷移し、注文が1件だけ作成されることを確認

**対応する自動テスト**: `tests/unit/use-cases/place-order.test.ts`の既存ケース（回帰確認）

## シナリオ3: カート画面でのグループ表示（User Story 3）

1. `payment_timing: at_order`の商品と`payment_timing: after_order`の商品を1つずつカートに入れる
2. チェックアウトを実行せずにカートサイドバーを開く
3. 商品が「注文時に支払う商品」/「注文後に請求される商品」の2グループに分かれて表示され、それぞれの小計が表示されることを確認
4. 一方の商品をカートから削除し、単一タイミングのみになった状態でカートサイドバーを開く
5. グループ見出しが表示されなくなり、従来通りの単一リスト表示に戻ることを確認

**対応する自動テスト**: カート表示用のグループ化関数の単体テスト（新規、`tests/unit/cart-*.test.ts`）

## シナリオ4: 混在カートの分割チェックアウト（User Story 2のコア）

1. `payment_timing: at_order`の商品と`payment_timing: after_order`の商品を1つずつカートに入れる
2. チェックアウトを実行する
3. Stripe Checkoutへリダイレクトされることを確認
4. Supabaseの`orders`テーブルを確認し、2件のOrderが同一の`split_group_id`を持って作成されていることを確認（`payment_flow`がそれぞれ`checkout`/`invoice`）
5. Stripe Checkoutの決済を完了し、`/order/complete`ページで、決済済み注文に加えて請求書発行待ちのもう一方の注文の存在も案内されることを確認

**対応する自動テスト**: `tests/integration/use-cases/place-order.test.ts`（新規ケース、実Supabase使用）

## シナリオ5: 月次上限超過時の両方ブロック（User Story 5）

1. 会員の月間購入上限に近い金額まで既に注文済みの状態を用意する
2. `payment_timing: at_order`の商品と`payment_timing: after_order`の商品を、合計すると上限を超える組み合わせでカートに入れる
3. チェックアウトを試みる
4. 上限超過エラーが表示され、Supabaseに新規Orderが1件も作成されていないことを確認

**対応する自動テスト**: `tests/unit/use-cases/place-order.test.ts`（新規ケース：分割対象でも上限超過時は両方ブロック）

## シナリオ6: 分割注文の関連付け表示（User Story 4）

1. シナリオ4の状態（分割済みの2件のOrder）を用意する
2. 管理画面（`/admin/orders`）でどちらか一方の注文詳細を開く
3. もう一方の関連注文へのリンク・案内が表示されることを確認
4. 分割されていない通常の注文（1件のみ）の詳細を開き、関連注文の表示が出ないことを確認

**対応する自動テスト**: `tests/e2e/order/`配下に新規E2Eケースを追加（既存の`checkout.spec.ts`を参考に）

## シナリオ7: 分割保存が途中で失敗した場合の原子性（FR-016）

ブラウザ操作では再現が難しいため、単体テストで検証する。

1. `OrderRepository`のモックで、1回目の`save()`（Order A）は成功、2回目の`save()`（Order B）は例外をスローするよう設定する
2. 混在カートで`placeOrder`ユースケースを直接呼び出す
3. `placeOrder`がエラーを投げることを確認する
4. モックの`orderRepo.save`（もしくは`delete`相当のメソッド）が呼ばれ、Order Aに対応する保存が取り消されていることを確認する（1件目の保存に対して削除が呼ばれたことをモックで検証）

**対応する自動テスト**: `tests/unit/use-cases/place-order.test.ts`（新規ケース：Order B保存失敗時にOrder Aもロールバックされる）

## 手動UI確認チェックリスト

CLAUDE.mdの「UIやフロントエンド変更時は実際にブラウザで確認する」方針に従い、以下を実際のブラウザで確認する。

- [ ] Sanity Studioの商品編集画面で`payment_timing`の選択肢・矛盾バリデーションの表示が分かりやすいか
- [ ] カートサイドバー・チェックアウト画面で、支払いタイミングごとのグループ分けが一目で分かるか（グループ名・小計の見せ方を含む）
- [ ] `/order/complete`・`/order/invoice-complete`ページで、もう一方の注文の状態が誤解なく伝わるか
- [ ] 管理画面の注文一覧・詳細で、分割された注文同士の関連が視覚的に分かるか
