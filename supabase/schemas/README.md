# supabase/schemas（自動で書き出した写し。直接編集しない）

このディレクトリは、全マイグレーションを当てたローカルDBの今の定義を、1オブジェクト1ファイルで書き出したもの（`task db:schema` = `scripts/db-schema-snapshot.sh`。issue #783）。

- **正はマイグレーション（`supabase/migrations/`）**。ここを直接編集しても DB には反映されない。`supabase/config.toml` の `[db.migrations].schema_paths` は空のままで、`supabase db reset` はマイグレーションだけを当てる
- 関数・テーブルの「今の定義」を読むための場所。同じ関数を何度も `create or replace` したマイグレーションを遡らなくても、`public/functions/<関数名>.sql` を開けば今の中身が読める
- マイグレーションを足した・変えたら、`supabase db reset`（ワークツリーでは `bash scripts/with-worktree-db.sh supabase db reset`）のあと `task db:schema` を実行してコミットする。書き出し忘れは CI の `Schema Files Drift` が検出する

## 中身

- `public/tables/<テーブル名>.sql`: テーブルと、その索引・トリガー・RLS ポリシー・権限・コメント
- `public/functions/<関数名>.sql`: 関数
- `public/types/<型名>.sql`: 型（enum 等）
- `public/schema.sql`・`public/default_privileges.sql`: スキーマ自体の権限・既定の権限
- `_cluster/extensions/*.sql`: 拡張
- `.pgdelta-export.json`: 書き出したファイルの一覧と読み込み順（Supabase CLI が書き出す）
