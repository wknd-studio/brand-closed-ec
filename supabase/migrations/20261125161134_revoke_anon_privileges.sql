-- anon ロールから public スキーマの権限を外す（issue #794）。
-- Clerk のセッショントークンに role: authenticated を足したため、ログイン済みの会員の操作は
-- authenticated で実行される。アプリはログインしていない人に Supabase を使わせない
-- （会員のクライアントは requireAuth() の後、管理系は service_role）ので、anon には何も残さない。
-- RLS を1つ書き間違えても、公開されている anon キーだけでは何も読み書きできないようにする。
--
-- 20260704110728_grant_authenticated_privileges.sql で anon に付けた権限と初期の権限を外す。
-- 関数は作成時に PUBLIC にも EXECUTE が付き、anon は PUBLIC を通して実行できるため、
-- PUBLIC からも外す（authenticated・service_role には明示的に付いているので影響しない）。
-- PUBLIC への初期の権限はスキーマ単位では外せないため、FOR ROLE postgres で外す。
-- これは public 以外のスキーマに postgres が今後作る関数にも効く（PUBLIC に EXECUTE が付かない）。
-- 今は public 以外に関数を作るマイグレーションは無い。作るときは、使うロールに GRANT EXECUTE する。

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
