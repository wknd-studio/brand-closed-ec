# Data Model: 商品別支払いタイミング設定とカート分割注文

**Feature**: 004-split-order-payment-timing
**Date**: 2026-07-31

## エンティティ変更一覧

### 商品(Product) — Sanity `product`スキーマ

既存フィールド（`src/sanity/schemas/product.ts`）に、以下を追加する。

| フィールド       | 型                              | 説明                                                                |
| ---------------- | ------------------------------- | ------------------------------------------------------------------- |
| `payment_timing` | `"at_order"` \| `"after_order"` | 注文時払い / 注文後払い。既定値は`"at_order"`（既存商品の後方互換） |

**バリデーション規則**:

- `is_negotiable === true`の商品は`payment_timing`が`"after_order"`でなければならない。`"at_order"`が設定されている場合はエラー（既存の`validatePrices`と同様、Sanityのカスタムバリデーション`rule.custom((value, {document}) => ...)`で実装）

**Studio UI挙動**:

- `is_negotiable === true`の場合、`price_rates`・`prices`フィールドは非表示にする（`hidden: ({document}) => document?.is_negotiable === true`）。入力しても購入フローでは使われないため、混乱を避ける目的

### カート項目(CartItem) — ドメイン値オブジェクト / クッキー保存型

本機能では「カート項目」を表す型が2つ存在し、両方に`paymentTiming`を追加する。

**ドメイン値オブジェクト**（`src/domain/value-objects/cart-item.ts`、`place-order.ts`ユースケース内でのみ使用）

| フィールド      | 型                              | 説明                                                           |
| --------------- | ------------------------------- | -------------------------------------------------------------- |
| `paymentTiming` | `"at_order"` \| `"after_order"` | 商品の`payment_timing`をそのままコピー。カート分割の判定に使う |

`ProductSnapshot`（`src/repositories/product-repository.ts`）にも同様に`paymentTiming`を追加し、`SanityProductRepository`（`src/infrastructure/sanity/sanity-product-repository.ts`）のGROQ射影に含める。

**クッキー保存型**（`src/lib/cart/types.ts`、会員のブラウザ側でカート内容を保持し`cart-sidebar.tsx`等で表示に使う。ドメイン値オブジェクトとは別の型で、Sanityへの都度アクセスなしに表示できるようキャッシュされたスナップショット）

| フィールド      | 型                              | 説明                                                           |
| --------------- | ------------------------------- | -------------------------------------------------------------- |
| `paymentTiming` | `"at_order"` \| `"after_order"` | 商品詳細ページからカート追加する際にSanityから取得しコピーする |

**UI挙動**: `cart-sidebar.tsx`・チェックアウト画面は、カート内に両方の`paymentTiming`が混在する場合、商品を「注文時に支払う商品」/「注文後に請求される商品」の2グループに分けて表示し、グループごとの小計を出す。単一タイミングのみの場合はグループ表示を行わない（決定7参照）。

### 注文(Order) — ドメインエンティティ / Supabase `orders`テーブル

`src/domain/entities/order.ts`に、以下を追加する。

| フィールド     | 型               | 説明                                                                                         |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `splitGroupId` | `string \| null` | チェックアウト分割によって同時生成された注文同士を関連付けるID。分割が発生しない場合は`null` |

Supabase `orders`テーブル（`supabase/migrations/`）に、以下のマイグレーションを追加する。

```sql
ALTER TABLE public.orders
  ADD COLUMN split_group_id UUID;

CREATE INDEX orders_split_group_id_idx
  ON public.orders(split_group_id)
  WHERE split_group_id IS NOT NULL;
```

**不変条件**:

- `splitGroupId`が非nullの場合、同一の`splitGroupId`を持つOrderは常に2件（`payment_flow`が異なる2件: 1件は`checkout`、1件は`invoice`）存在する（本機能のスコープでは2区分の分割のみを想定するため）
- `splitGroupId`が`null`の場合、その注文はチェックアウト分割の対象にならなかった（カートが単一の支払いタイミングのみで構成されていた）注文である

## 状態遷移

商品・注文いずれについても、既存の状態遷移（`OrderStatus`の`pending_payment → paid → sourcing → ...`、`confirming → invoice_sent → paid → ...`）に変更はない。分割によって生成される2件のOrderは、それぞれ独立したライフサイクルとして既存の状態遷移をそのまま辿る（spec.mdのEdge Casesの通り）。

## リレーションシップ図（概念）

```text
Product (Sanity)
  payment_timing: at_order | after_order
        │
        ▼ (カート追加時にコピー)
CartItem
  paymentTiming: at_order | after_order
        │
        ▼ (チェックアウト時に分割)
   ┌────┴────┐
   ▼         ▼
Order A    Order B
(checkout) (invoice)
   └────┬────┘
        │ 同一 split_group_id（両方存在する場合のみ）
```
