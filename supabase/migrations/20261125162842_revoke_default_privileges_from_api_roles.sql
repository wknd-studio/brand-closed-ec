-- public スキーマに今後作るテーブル・シーケンス・関数に、anon・authenticated への権限を自動で付けない。
-- 付けるときは、スキーマのファイル（supabase/schemas/）に GRANT を書く（#784）。
--
-- 理由: supabase/schemas/ から sync でマイグレーションを作るとき、Supabase CLI は
-- スキーマのファイルをシャドーDBに当てて今のDBと比べる。既定の権限で anon・authenticated に
-- 自動で付くと、マイグレーションで REVOKE 済みの関数（SECURITY DEFINER 等）・テーブルにも
-- シャドーDBでは権限が付き、何も変えていなくても sync が anon への GRANT を作ってしまう。
-- 既定の権限を外すと、どのロールに何を許すかがスキーマのファイルにすべて書かれ、sync の結果と一致する。
--
-- 既にあるテーブル・関数の権限は変えない（ALTER DEFAULT PRIVILEGES は、これから作るものにだけ効く）。
-- 20260704110728_grant_authenticated_privileges.sql で付けた既定の権限を取り消す。

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;
