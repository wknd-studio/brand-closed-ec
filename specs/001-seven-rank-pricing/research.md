# Phase 0 Research: 7ランクモデルへの移行

## Decision: Free会員データの扱い

- **Decision**: 本番相当のFree会員データは実在しない（プレローンチ・テストデータのみ）。既存データの安全な段階移行は不要とし、テスト/シードデータを新7ランクの値で入れ直す前提で進める
- **Rationale**: ユーザー確認済み。実会員への課金影響がないため、複雑な移行戦略（並行稼働・段階リリース）は不要
- **Alternatives considered**: Free会員を自動でSTARTERに昇格し課金開始 → 対象がいないため不要

## Decision: 旧→新ランクの対応表（テストデータ入れ替え用）

| 旧ランク（5段階） | 新ランク（7段階） |
| ----------------- | ----------------- |
| free              | STARTER           |
| entry             | BASIC             |
| standard          | STANDARD          |
| pro               | PRO               |
| enterprise        | ENTERPRISE        |

- **Rationale**: 名称が一致する箇所（standard/pro/enterprise）はそのまま対応させ、対応の薄いfree/entryは新モデルの下位2段階（STARTER/BASIC）に割り当てる。テストデータの入れ替えが目的であり、厳密なビジネス上の等価性は求められない
- **Alternatives considered**: なし（テストデータのため簡易対応で十分）

## Decision: ランク定義の単一情報源化

- **Decision**: `src/domain/value-objects/member-rank.ts` を唯一の正とし、`src/lib/sanity/products.ts`・`src/lib/constants/membership.ts`の重複定義を廃止してdomain層からimportする形に統一する
- **Rationale**: `docs/architecture-refactoring.md`が既に指摘していた重複問題（月次上限ロジックの重複）と同根の問題。7ランクの値を複数箇所に個別に反映すると更新漏れのリスクがあるため、この機会に解消する
- **Alternatives considered**: 重複を放置し値だけ7ランクに置き換える → 更新漏れリスクを放置することになるため却下

## Decision: Postgres enum型の移行方法

- **Decision**: `member_rank` enum型に新しい7つの値を追加した新しいマイグレーションを作成し、`users.rank`・`orders.rank_at_order`のカラムをバックフィルしてから、旧5値を使うコードパスがなくなったことを確認した上で別マイグレーションで旧値を削除する（2段階マイグレーション）
- **Rationale**: PostgreSQLの `ALTER TYPE ... DROP VALUE` は直接サポートされていない（型の作り直しが必要）ため、値の追加→データ移行→コード側の参照除去→型の作り直しの順で安全に進める。プレローンチでリスクは低いが、本番運用を見据えた手順として採用する
- **Alternatives considered**: 型を最初から作り直す（enum再作成） → テーブルの列を一度作り直す必要があり、プレローンチとはいえ手順が煩雑になるため、まずは値追加方式を採用し、必要なら後続タスクで型の完全な作り直しを検討する

## Decision: Stripe Price ID

- **Decision**: 7ランク分のStripe Product/Priceを新規にStripeダッシュボード（テストモード→本番）で作成し、環境変数または設定マッピングでランク値とPrice IDを対応させる
- **Rationale**: 既存の5ランク分のPrice IDをそのまま流用できるのはstandard/pro/enterpriseの3つのみで、STARTER/BASIC/ADVANCED/PREMIUMは新規作成が必要
- **Alternatives considered**: なし（Stripe側の制約上、価格ごとに新規Price作成が必須）
