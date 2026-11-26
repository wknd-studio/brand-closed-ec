# supabase/schemas（スキーマのファイル。正）

DBのスキーマの正。1オブジェクト1ファイルで、テーブル・関数等の今の定義を書く（issue #784。手順は `docs/declarative-schema.md`）。

- スキーマを変えるときは、ここのファイルを直してから `task db:sync -- <名前>` でマイグレーションを作る。作ったマイグレーションを読んで直し、`supabase db reset`（ワークツリーでは `bash scripts/with-worktree-db.sh supabase db reset`）→ `task db:schema` で、このディレクトリに差分が残らないことを確かめてコミットする
- データの変更・名前の変更・sync が追えないオブジェクトは、`supabase migration new` でマイグレーションを手で書き、ここのファイルも同じ形に直す
- 本番・stg に当たるのはマイグレーション（`supabase/migrations/`）だけ。`supabase/config.toml` の `[db.migrations].schema_paths` は空のままで、`supabase db reset` もマイグレーションだけを当てる
- 書式は `task db:schema`（`scripts/db-schema-snapshot.sh`）の書き出しに合わせる。CI の `Schema Files Drift` が、マイグレーションを当てたDBから書き出し直した結果との食い違いと、sync が差を見つけないことを検査する

## 中身

- `public/tables/<テーブル名>.sql`: テーブルと、その索引・トリガー・RLS ポリシー・権限・コメント
- `public/functions/<関数名>.sql`: 関数
- `public/types/<型名>.sql`: 型（enum 等）
- `public/schema.sql`・`public/default_privileges.sql`: スキーマ自体の権限・既定の権限（`default_privileges.sql` の先頭の `REVOKE` は書き出しが足すもの。理由は `docs/declarative-schema.md` の「権限」）
- `_cluster/extensions/*.sql`: 拡張
- `.pgdelta-export.json`: ファイルの一覧と読み込み順（Supabase CLI が書き出す。新しいファイルを足したら `task db:schema` で更新する）
