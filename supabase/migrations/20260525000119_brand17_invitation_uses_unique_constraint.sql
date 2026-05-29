-- 招待コードの使用記録を一意にする（重複 upsert 対策）
ALTER TABLE public.invitation_uses
  ADD CONSTRAINT invitation_uses_code_user_unique
  UNIQUE (invitation_code_id, used_by_user_id);
