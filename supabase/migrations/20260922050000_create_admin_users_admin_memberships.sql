-- ============================================================
-- 運営者RBAC基盤: admin_users / admin_memberships
-- docs/db-schema-redesign.md 移行方針ステップ7・docs/domain/admin-rbac.md
-- ============================================================

-- ============================================================
-- admin_users
-- ============================================================

CREATE TABLE public.admin_users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- admin_memberships
-- ============================================================

CREATE TABLE public.admin_memberships (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL UNIQUE REFERENCES public.admin_users(id),
  clerk_role     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER admin_memberships_updated_at
  BEFORE UPDATE ON public.admin_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS ヘルパー関数
-- Clerk JWT の sub クレームから admin_users.id を引く
-- (get_current_user_id() の運営者版。顧客の users とは別集約のため分離する)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_admin_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.admin_users
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
$$;

-- ============================================================
-- RLS ポリシー
-- 運営スタッフ本人が自分自身の身元・ロールを参照できるSELECTのみ設ける。
-- 書き込みはClerk Webhook（service role）経由のみのため、
-- INSERT/UPDATE/DELETEポリシーは設けない。
-- ============================================================

CREATE POLICY "admin_users: select own" ON public.admin_users
  FOR SELECT USING (id = get_current_admin_user_id());

CREATE POLICY "admin_memberships: select own" ON public.admin_memberships
  FOR SELECT USING (admin_user_id = get_current_admin_user_id());
