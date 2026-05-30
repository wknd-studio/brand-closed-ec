-- service_role に public スキーマの全テーブル・シーケンス・関数へのアクセス権を付与する。
-- supabase db reset や DROP SCHEMA 後にデフォルト権限が消えることがあるため、
-- 明示的に付与しておく。

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 今後 CREATE TABLE 等で追加されるオブジェクトにも自動で権限を付与する
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
