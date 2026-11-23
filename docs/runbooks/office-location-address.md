# 事務所（locations の office 行）の住所を設定する

`locations` の `office` 行は、マイグレーションでは住所・電話番号を NULL のまま入れている（#354）。実際の住所をリポジトリに書かないため、環境（stg・prod）ごとに SQL で設定する。

v1 では住所をシステムが使う場面は無い（送り状は手作業、返品の返送先は個別メールで案内）。使う機能を作るまでは未設定のままでもよい。

## 手順

Supabase ダッシュボードの SQL Editor で、対象の環境のプロジェクトを開いて実行する。

```sql
UPDATE public.locations
SET postal_code   = '1000001',
    prefecture    = '東京都',
    city          = '千代田区',
    address_line1 = '千代田1-1',
    address_line2 = NULL,
    phone_number  = '03-0000-0000'
WHERE code = 'office';
```

値は例。`postal_code` の書き方（ハイフンの有無）は `addresses` に合わせる。

## 確認

```sql
SELECT code, postal_code, prefecture, city, address_line1, address_line2, phone_number, updated_at
FROM public.locations
WHERE code = 'office';
```

`updated_at` は更新時にトリガーで自動で更新される。
