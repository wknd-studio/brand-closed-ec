# スキーマ・RLS

マイグレーション（`supabase/migrations/`）の変更。本番のDBに一度当たると戻しにくく、RLSの漏れは他の会員のデータが見える事故に直結する。

## 確認観点

- [ ] 誰がどの行を読める・書けるか（新しいテーブルにRLSが有効か、ポリシーの `using` / `with check` が会員・管理者ごとに正しいか）
- [ ] 既存データへの影響（`not null` の追加・型の変更・削除で、既存の行が壊れたり消えたりしないか。必要なバックフィルがあるか）
- [ ] `-- destructive-ok:` で通した `drop`・型の変更・`truncate` の理由が妥当か。`task db:sync` が名前の変更を消して作り直すにしていないか（`docs/declarative-schema.md`）
- [ ] 新しいテーブル・関数に、使わせるロール（`authenticated` 等）にだけ `GRANT` を書いているか（`anon` に付けていないか。既定では付かない）
- [ ] `security definer` の関数・ビューがRLSを迂回していないか（`search_path` の固定、呼べるロールの制限）
- [ ] 制約・インデックス（一意制約・外部キーの `on delete`、検索に使う列のインデックス）
- [ ] 統合テストでRLSを実DBに当てて確認しているか（許可されない利用者で読めない・書けないことも含む）
- [ ] `src/types/database.types.ts` を再生成しているか（CIの `Schema Types Drift`）、タイムスタンプがdevelopの最新より新しいか（`Migration Order`）
