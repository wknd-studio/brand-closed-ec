# Phase 1 Data Model: 7ランクモデルへの移行

## `MemberRank`（`src/domain/value-objects/member-rank.ts`）

```ts
export const RANK_ORDER = [
  "starter",
  "basic",
  "standard",
  "pro",
  "advanced",
  "premium",
  "enterprise",
] as const;

export type MemberRankValue = (typeof RANK_ORDER)[number];

// 月額費用・初期費用・月間仕入れ上限は docs/archive/service-spec.md を正とする。
// 月間仕入れ上限は同ドキュメントでTBDのため、確定次第ここに反映する。
const MONTHLY_LIMITS: Record<MemberRankValue, number> = {
  starter: 0 /* TBD */,
  basic: 0 /* TBD */,
  standard: 0 /* TBD */,
  pro: 0 /* TBD */,
  advanced: 0 /* TBD */,
  premium: 0 /* TBD */,
  enterprise: Number.MAX_SAFE_INTEGER,
};
```

`MemberRank`クラス自体のpublic API（`of()`, `getMonthlyLimit()`, `canAccess()`, `isHigherThan()`, `equals()`）は変更しない。値のセットのみ7段階に置き換える。

## 依存先の変更（重複解消）

### `src/lib/sanity/products.ts`

独自の`RANK_ORDER`/`MemberRank`型定義を削除し、`src/domain/value-objects/member-rank.ts`から`RANK_ORDER`・`MemberRankValue`をimportして使う。`getAllowedRanks()`・`isProductAccessible()`のロジック自体は変更不要（参照する配列が7段階になるだけ）。

### `src/lib/constants/membership.ts`

独自の`MONTHLY_LIMITS`定義を削除し、`src/domain/value-objects/member-rank.ts`の`MemberRank.getMonthlyLimit()`を使うよう呼び出し側を更新する。

### `src/app/onboarding/plan/actions.ts` / `plan-selector.tsx`

`VALID_PLANS`・`PLANS`のハードコード配列を、`RANK_ORDER`から`enterprise`を除いた6要素（`starter`〜`premium`）を動的に生成する形に変更する。表示ラベル（日本語名）は`docs/archive/service-spec.md`の「プラン概要」表に対応させる。

## DBスキーマ変更

### `member_rank` enum型（`supabase/migrations/`）

```sql
-- Step 1: 新しい7つの値を追加（既存値は残したまま）
ALTER TYPE member_rank ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE member_rank ADD VALUE IF NOT EXISTS 'basic';
ALTER TYPE member_rank ADD VALUE IF NOT EXISTS 'advanced';
ALTER TYPE member_rank ADD VALUE IF NOT EXISTS 'premium';
-- standard/pro/enterpriseは既存値をそのまま使う

-- Step 2（別マイグレーション。コード側の参照が7ランクに切り替わった後に実行）:
-- 既存データ（テストデータ）を新ランクにバックフィル
UPDATE users SET rank = 'starter' WHERE rank = 'free';
UPDATE users SET rank = 'basic' WHERE rank = 'entry';
UPDATE orders SET rank_at_order = 'starter' WHERE rank_at_order = 'free';
UPDATE orders SET rank_at_order = 'basic' WHERE rank_at_order = 'entry';

-- Step 3（別マイグレーション。旧値を使うコードが無くなったことを確認後）:
-- 型の作り直しによる旧値（free, entry）の削除
```

Step 3は本featureのスコープでは実施せず、後続タスクとして`tasks.md`のPolishフェーズに記録する（プレローンチのためリスクは低いが、型の作り直しはテーブルロックを伴う操作のため慎重に別タイミングで行う）。

### Sanity CMS: `product`スキーマの`min_rank`・`prices`

`src/sanity/schemas/product.ts`の`RANK_OPTIONS`を7ランクに更新する。既存の商品ドキュメントの`min_rank`・`prices`フィールドの値は、Sanity Studio側で手動更新する（件数が少なければ手動、多ければマイグレーションスクリプトを別途検討）。
