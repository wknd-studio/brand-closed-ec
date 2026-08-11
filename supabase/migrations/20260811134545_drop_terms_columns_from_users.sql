-- 利用規約の同意記録はClerkのlegal_accepted_atのみで管理する方針としたため、
-- usersテーブル側の重複カラムを削除する。
ALTER TABLE users
  DROP COLUMN terms_agreed_at,
  DROP COLUMN terms_version;
