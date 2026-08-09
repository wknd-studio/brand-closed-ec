-- 法人会員（B2B）対応: usersテーブルへのプロフィール関連カラム追加
-- specs/005-b2b-organization/data-model.md の設計に基づく

ALTER TABLE public.users
  ADD COLUMN phone_number         TEXT NOT NULL DEFAULT '',
  ADD COLUMN profile_completed_at TIMESTAMPTZ;
