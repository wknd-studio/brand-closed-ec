# Internal Interface Contracts: 商品別支払いタイミング設定とカート分割注文

**Feature**: 004-split-order-payment-timing
**Date**: 2026-07-31

本機能は公開API/外部インターフェースを持たない内部アプリケーション機能のため、ここでは影響を受ける既存のTypeScriptインターフェース・関数シグネチャの変更契約を記載する。実装フェーズ（`/speckit-tasks`後）ではこの契約に沿ったテストを先に書くこと。

## 1. `ProductSnapshot` / `ProductRepository`

`src/repositories/product-repository.ts`

```ts
export interface ProductSnapshot {
  sanityProductId: string;
  productName: string;
  unitPrice: Money;
  isNegotiable: boolean;
  minRank: MemberRankValue;
  paymentTiming: "at_order" | "after_order"; // 追加
}
```

`findByIds`のシグネチャ自体は変更しない。返却値に`paymentTiming`が含まれるようになる。

## 2. `CartItem`

`src/domain/value-objects/cart-item.ts`

```ts
interface CartItemProps {
  sanityProductId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
  isNegotiable: boolean;
  paymentTiming: "at_order" | "after_order"; // 追加
}
```

`CartItem.of()`は`paymentTiming`必須プロパティを追加で受け取る。

## 2.5. クッキー保存カート型（会員ブラウザ側）

`src/lib/cart/types.ts`

```ts
export type CartItem = {
  productId: string;
  productName: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number | null; // null = 要相談
  availability: "available" | "out_of_stock" | "discontinued";
  paymentTiming: "at_order" | "after_order"; // 追加
};
```

**契約**:

- 商品詳細ページの「カートに追加」導線（`add-to-cart-button.tsx`）で、Sanityから取得した`payment_timing`をコピーしてCookieに保存する
- `cart-sidebar.tsx`・チェックアウト画面は、`items`を`paymentTiming`でグループ化して表示する関数（新規、例: `groupCartItemsByPaymentTiming(items: CartItem[]): {atOrder: CartItem[]; afterOrder: CartItem[]}`）を使う。両方のグループが非空の場合のみグループ見出しを表示する

**⚠️ セキュリティ上の注意（信頼境界）**: このクッキー保存型の`unitPrice`・`paymentTiming`は**表示専用**であり、改竄可能な会員のブラウザ側で保持される値である。既存の`unitPrice`が`place-order.ts`で一切信用されず、`sanityProductId`から都度サーバー側でSanityを引き直して実際の価格を決定しているのと全く同じ理由で、`paymentTiming`もチェックアウト時の分割判定にこのクッキー値を直接使ってはならない。`PlaceOrderInput.cartItems`（下記5参照）は今まで通り`sanityProductId`・`quantity`・`productName`のみを受け取り、`paymentTiming`は含めない。分割判定は必ず`productRepo.findByIds`で取得した`ProductSnapshot.paymentTiming`（1番参照）を使う。

## 3. カート分割関数（新規）

`src/domain/services/order-flow-selector.ts`（既存の`selectOrderFlow`を置き換え）

```ts
export type SplitCartResult = {
  atOrderItems: CartItem[];
  afterOrderItems: CartItem[];
};

export function splitCartByPaymentTiming(
  cartItems: CartItem[]
): SplitCartResult;
```

**契約**:

- `paymentTiming === "at_order"`の`CartItem`は`atOrderItems`に、それ以外（`"after_order"`、および`isNegotiable === true`のもの）は`afterOrderItems`に分類する
- 入力が空配列の場合、両方とも空配列を返す
- 全アイテムが同じ`paymentTiming`の場合、一方は空配列になる（既存の単一フロー挙動と等価）

## 4. `Order`

`src/domain/entities/order.ts`

```ts
interface OrderProps {
  // ...既存フィールド
  splitGroupId: string | null; // 追加
}
```

## 5. `PlaceOrderOutput`

`src/use-cases/place-order.ts`

```ts
export type PlaceOrderOutput = {
  redirectUrl: string;
};
```

**契約（変更なし・振る舞いの明確化）**:

- カートが単一の支払いタイミングのみの場合: 既存と同じ（`checkout`なら Stripe Checkout URLへ、`invoice`なら`/order/invoice-complete?order_id=...`へ）
- カートが分割される場合: `atOrderItems`が非空であれば、そちらのOrderに対するStripe Checkout URLを返す（`redirectUrl`はCheckoutへの案内を優先する。invoice側のOrderは既に作成済みで、Checkout完了後の`/order/complete`ページがsplit_group_idを介してその存在を案内する）
- `atOrderItems`が空（＝全商品がafter_order）の場合: 既存の全invoiceケースと同様、`/order/invoice-complete?order_id=...`を返す

**契約（分割時のOrder保存の原子性）**:

- 分割が発生する場合、Order A・Order Bの`orderRepo.save()`は両方とも呼び出した上で、両方成功した場合にのみ後続の処理（Stripe Checkout Session作成・通知送信）に進む
- いずれか一方の`save()`が失敗した場合、既に保存済みのもう一方を`orderRepo`から削除（compensating delete）し、`place-order`全体を失敗として呼び出し元にエラーを伝播する。この場合、Order A・Order Bのいずれもデータベースに残らない
- Stripe Checkout Session作成・通知送信より後段の失敗は、この原子性保証の対象外（既存の単一注文フローと同じ扱い。決定8参照）

## 6. `OrderRepository`

`src/repositories/order-repository.ts`

```ts
export interface OrderRepository {
  // ...既存メソッド
  findBySplitGroupId(splitGroupId: string): Promise<Order[]>; // 追加
  delete(orderId: string): Promise<void>; // 追加（分割保存失敗時のcompensating delete専用）
}
```

**契約**:

- `findBySplitGroupId`: 同一`splitGroupId`を持つOrderを全件返す（分割が発生していれば2件、それ以外は呼び出されない想定）
- `delete`: 指定したOrderをデータベースから削除する。分割時に片方の`save()`が失敗した場合の補償処理としてのみ使用され、それ以外の通常フロー（キャンセル等）では既存通り`status`の更新（論理的な状態遷移）を使う。物理削除は本ユースケース専用の限定的な用途
- `/order/complete`・`/order/invoice-complete`ページ、および管理画面の注文詳細ページから、関連注文の表示に使う

## 7. Sanity `product`スキーマバリデーション（新規の純粋関数）

`src/sanity/schemas/product.ts`（または専用モジュール）

```ts
export function validatePaymentTiming(
  paymentTiming: "at_order" | "after_order" | undefined,
  document: { is_negotiable?: boolean } | undefined
): string | true;
```

**契約**:

- `document.is_negotiable === true`かつ`paymentTiming === "at_order"`の場合はエラーメッセージ文字列を返す
- それ以外は`true`を返す
- 既存の`validatePrices`（同ファイル内）と同じ関数シグネチャ規約（`string | true`を返す）に揃える

## 8. `price_rates` / `prices`フィールドの表示条件（Sanity Studio UI）

`src/sanity/schemas/product.ts`

```ts
defineField({
  name: "price_rates",
  // ...
  hidden: ({ document }) => document?.is_negotiable === true, // 追加
}),
defineField({
  name: "prices",
  // ...
  hidden: ({ document }) => document?.is_negotiable === true, // 追加
}),
```

**契約**:

- `is_negotiable === true`の商品編集画面では、`price_rates`・`prices`フィールドをStudio UI上で非表示にする（`validatePrices`/`validatePaymentTiming`のバリデーション対象外である点と一貫させる）
- 新規の関数・型は不要。既存フィールド定義への`hidden`オプション追加のみ
