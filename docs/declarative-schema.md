# 宣言的スキーマ（supabase/schemas/ を正にする）

DBのスキーマを変えるときは、`supabase/schemas/` のファイル（1オブジェクト1ファイル）を直し、マイグレーションは `task db:sync` で自動で作る（issue #784。段階A は issue #783）。Supabase の [Declarative database schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas) の進め方。

本番・stg に当たるのは今までどおりマイグレーション（`supabase/migrations/`）だけ（`supabase db push`・CI の Migrate DB）。スキーマのファイルはマイグレーションを作る材料で、本番が直接読むことはない。`supabase/config.toml` の `[db.migrations].schema_paths` は空のままで、`supabase db reset` もマイグレーションだけを当てる。

## スキーマを変える手順

1. `supabase/schemas/` のファイルを直す（列を足す・関数の中身を変える・ポリシーを足す等）。新しいテーブル・関数はファイルを足す
2. `task db:sync -- <名前>` でマイグレーションを作る（例: `task db:sync -- add_note_to_orders`）
   - ローカルの DB には当てない（`--no-apply`）。sync はシャドーDBにマイグレーションとスキーマのファイルをそれぞれ当てて比べる
   - ローカルの Supabase CLI の版がCIと違えば止まる（版によって作るマイグレーションが変わるため）
3. 作ったマイグレーションを読んで直す。特に次を確かめる
   - `DROP TABLE`・`DROP COLUMN` が、名前の変更のつもりで出ていないか（下の「試した結果」）
   - 書いていない `GRANT`・`REVOKE` が無いか（下の「権限」）
4. `supabase db reset`（ワークツリーでは `bash scripts/with-worktree-db.sh supabase db reset`）で当てる
5. `task db:schema` を実行し、`supabase/schemas/` に差分が残らないことを確かめる。差分が出たら、その形（書き出しの書式・列の並び）にファイルを合わせる
6. `supabase gen types typescript --local > src/types/database.types.ts` を実行する
7. スキーマのファイル・マイグレーション・`database.types.ts` をコミットする

## 手で書くマイグレーション

次は sync では作れない・作らせると危ないので、`supabase migration new <名前>` で手で書く。`_custom/` のような別の置き場所は使わず、ふつうのマイグレーションとして `supabase/migrations/` に置く。

- **データの変更**（`insert`・`update`・`delete`。既存の行の値の移し替え・バックフィル等）: sync はスキーマの差しか見ない
- **名前の変更**（テーブル・列）: `ALTER TABLE ... RENAME TO` / `RENAME COLUMN` を書く。sync に任せると消して作り直す（データが消える）
- **sync が追えないオブジェクト**: `public` 以外のスキーマ（`auth`・`storage` 等）のトリガー・ポリシー、`pg_cron` のジョブ等。`supabase db schema declarative sync --strict-coverage` で、sync が扱えずに残したオブジェクトが分かる

順番の決まり:

- データの変更は、それが使う列・テーブルを作るマイグレーション（sync で作ったもの）より**後**のタイムスタンプにする。スキーマのファイルを直して sync したあとに、`supabase migration new` で作れば自然にそうなる
- 列を消す前にデータを移すときは、移すマイグレーション（手で書く）→ 消すマイグレーション（sync）の順。先に手で書いて当ててから、ファイルから列を消して sync する
- 名前の変更は、手で書いたマイグレーションと、ファイルの書き換えを同じPRで行う。手で書いて、ファイルも新しい名前に直したら、`task db:sync -- <名前>` が「差が無いのでマイグレーションは作らなかった」と出せばそろっている
- 手で書いたマイグレーションのあとも、手順の 4〜7 を行う（ファイルの直し忘れは CI の `Schema Files Drift` が止める）

## 試した結果（CLI v2.116.0。2026-11-26）

`public.locations` で試した。

| ファイルの変更                                                          | sync が作ったマイグレーション                                                                                                                                    | 決まり                                                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 列名の変更（`address_line2` → `address_line_2`）                        | `DROP COLUMN "address_line2"` と `ADD COLUMN "address_line_2" text`（**データが消える**）                                                                        | 手で `RENAME COLUMN` を書く                                                                                                |
| テーブル名の変更（`locations` → `stock_locations`。参照する外部キーも） | 外部キーを消し、`DROP TABLE "public"."locations"`、`CREATE TABLE "public"."stock_locations"`、外部キー・トリガー・コメント・権限を作り直す（**データが消える**） | 手で `RENAME TO` を書く                                                                                                    |
| 列の型の変更（`text` → `varchar(20)`）                                  | `ALTER COLUMN ... DROP DEFAULT` と `ALTER COLUMN ... TYPE character varying(20) USING "phone_number"::character varying(20)`                                     | 変換できない値・桁あふれがあると当てたときに失敗する。既存の値を確かめ、必要なら先にデータを直すマイグレーションを手で書く |
| 列の削除                                                                | `DROP COLUMN "address_line2"`                                                                                                                                    | 意図した削除なら `-- destructive-ok: <理由>` を書く（下の「危ないマイグレーションの検査」）                                |
| 列の追加（末尾に `note text`）                                          | `ADD COLUMN "note" text`                                                                                                                                         | そのままでよい                                                                                                             |
| 手で `RENAME COLUMN note TO memo` を書き、ファイルも `memo` に直した    | 何も作らない（差が無い）                                                                                                                                         | —                                                                                                                          |

- 列は**表の末尾に**足す。`ADD COLUMN` は末尾に足すため、ファイルの途中に書くと、`task db:schema` で書き出し直したときに列の並びが変わり、`Schema Files Drift` が失敗する
- `sync` が作るマイグレーションは、依存の順（外部キーを消す → テーブルを消す → 作る → 外部キーを足す）に並ぶ

## 危ないマイグレーションの検査

CI の `Destructive Migration Check`（`.github/workflows/migration-order.yml`。中身は `scripts/ci/check-destructive-migrations.ts`）が、PRで追加・変更したマイグレーションに次の文があれば失敗する。コメント・文字列・二重引用符の識別子の中の語と、`GRANT`・`REVOKE` の権限の名前（`TRUNCATE`）は見ない。DO ブロックの中は見る。`ALTER TABLE x DROP y`・`ALTER TABLE x ALTER y TYPE ...` のように `COLUMN` を省いた書き方も見る。

- `drop table`
- `drop column`
- `alter column ... type`（`set data type` も）
- `truncate`

意図して消す・型を変えるときは、そのマイグレーションに理由を書いたコメントを入れると通す（CIの出力に、通したファイルと理由が警告として出る）。

```sql
-- destructive-ok: note 列は #999 で使わなくなった。実データは無い
ALTER TABLE "public"."orders" DROP COLUMN "note";
```

マイグレーションを含むPRには `high-risk`・`risk:db` が付き、人間が精読する（`docs/review-checklists/db.md`）。この検査は、sync が名前の変更を消して作り直すにしたのを見落とさないためのもの。

## 権限（GRANT・REVOKE）

- `public` に作るテーブル・シーケンス・関数には、`anon`・`authenticated` への権限が**自動では付かない**（マイグレーション `20261125162842_revoke_default_privileges_from_api_roles.sql`）。使わせるロールへの `GRANT` をスキーマのファイルに書く。書かないと、RLS のポリシーがあっても `authenticated` から読めない（`42501 permission denied`）
  - 例: `GRANT SELECT, INSERT ON TABLE "public"."x" TO "authenticated";`（書き出しの書式に合わせると `task db:schema` で差分が出ない）
  - `SECURITY DEFINER` の関数は、呼ばせるロールにだけ `GRANT EXECUTE` を書く
- 既に作ったテーブル・関数の権限は変えていない（既定の権限は、これから作るものにだけ効く）
- `task db:schema` の書き出しは、`public/default_privileges.sql` の先頭に、Supabase が最初に付ける既定の権限（`anon`・`authenticated`・`service_role`）をすべて外す文を足す（`scripts/db-schema-snapshot.sh` の `pin_default_privileges`）。書き出しは今ある `GRANT` しか書かないが、sync はスキーマのファイルを Supabase の初期状態のシャドーDBに当てて比べるため、外さないとシャドーDBにだけ権限が残り、何も変えていなくても sync が `REVOKE` 済みの関数（`apply_rank_change` 等）・テーブル（`returns` 等）に `anon` への `GRANT` を作っていた
- sync が作ったマイグレーションに、ファイルに書いていない `GRANT`・`REVOKE` が混ざったら、そのマイグレーションから消さず、スキーマのファイルの権限を意図どおりに直してから sync し直す。消してコミットすると、CI の `Schema Files Drift` の sync の検査（`bash scripts/db-schema-sync.sh --check`）が、同じ `GRANT`・`REVOKE` をもう一度作って失敗する

## CI の検査

`Schema Files Drift`（`.github/workflows/deploy.yml`）が、マイグレーションを当てたDBについて次の2つを確かめる。

1. 書き出し直した結果 = コミット済みの `supabase/schemas/`（`bash scripts/db-schema-snapshot.sh --check`）。マイグレーションを手で書いて、ファイルを直し忘れたときに失敗する
2. sync が差を見つけない（`bash scripts/db-schema-sync.sh --check`）。ファイルを直してマイグレーションを作り忘れた・sync が作ったマイグレーションを手で直してファイルと食い違ったときに失敗する

Supabase CLI の版は、`.github/workflows/` の `install-cli` のすべての使用箇所で同じにする（`tests/unit/db-schema-sync.test.ts` が検査する）。ローカルの版がCIと違うと `task db:sync` が止まる。版を上げるときは、全箇所を同時に上げ、何も変えずに `task db:sync -- --check` が通ることを確かめる（v3 は `supabase/config.toml` の `[inbucket]` を受け付けないため、上げるには設定の書き換えが要る）。
