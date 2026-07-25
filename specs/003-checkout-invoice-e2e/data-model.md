# Phase 1 Data Model: カタログ〜チェックアウト・決済確定フローのE2Eテスト網羅

本featureはテストの追加のみであり、新しいデータモデルは導入しない。テストが参照する既存エンティティを整理する。

## Order（既存）

| フィールド                   | 型                                                                              | 本featureでの検証観点                                  |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `payment_flow`               | `"checkout"` \| `"invoice"`                                                     | US1は`checkout`、US2は`invoice`になることを確認        |
| `status`                     | `order_status` enum（`pending_payment`/`confirming`/`paid`/`limit_exceeded`等） | US1は`pending_payment`→`paid`、US2は`confirming`       |
| `shipping_address_snapshot`  | `Json`                                                                          | 新規入力・既存選択どちらでも正しく記録されることを確認 |
| `billing_address_snapshot`   | `Json`                                                                          | 同上                                                   |
| `stripe_checkout_session_id` | `string \| null`                                                                | US1でStripe決済後に注文を特定するために使う            |

## Address（既存）

| フィールド   | 型                          | 本featureでの検証観点                                  |
| ------------ | --------------------------- | ------------------------------------------------------ |
| `type`       | `"shipping"` \| `"billing"` | 既存住所の事前準備（Supabase直接insert）に使用         |
| `is_default` | `boolean`                   | チェックアウト画面のデフォルト選択挙動の前提として使用 |

## Product（Sanity、既存・読み取り専用）

| フィールド      | 型        | 本featureでの検証観点                                                   |
| --------------- | --------- | ----------------------------------------------------------------------- |
| `is_negotiable` | `boolean` | `true`なら要相談商品としてUS2の対象、`false`ならUS1の対象               |
| `min_rank`      | `string`  | テストで使う会員のランク（STARTER）でアクセス可能な商品を選ぶ必要がある |

**注記**: US1（固定価格商品）は既存のシード商品（`scripts/seed-products.ts`で作成される、`min_rank: "starter"`の商品）をそのまま使う。ローカル/CI環境でシードが実行済みであることが前提となる（`quickstart.md`の前提条件参照）。US2（要相談商品）は、シードデータに`is_negotiable: true`の商品が存在しないため、テスト専用のブランド・商品をSanity APIで動的に作成し、テスト後に削除する（`research.md`参照）。
