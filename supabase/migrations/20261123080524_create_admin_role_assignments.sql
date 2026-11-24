-- ============================================================
-- 運営スタッフのロール: admin_role_assignments（#390）
-- docs/domain/admin-rbac.md「権限マトリクス」「ロールの付与」
--
-- ロール → 権限の対応はコード（src/domain/value-objects/admin-role.ts）が正で、DB は「誰がどのロールか」だけを持つ。
-- admin_memberships（Clerk の運営組織のメンバーシップのミラー。Webhook だけが書き、脱退で消える）とは
-- 書き手と寿命が違うため別テーブルにする。admin_users.id に紐づけ、認証基盤（Clerk）に依存させない。
-- 付与・変更・取り消しは SQL（service role）で行う。アプリから書き込む経路は無い
-- ============================================================

CREATE TABLE public.admin_role_assignments (
  admin_user_id  UUID PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
  -- ロールはコードの権限マトリクスと揃える。増減するときはマイグレーションとコードを一緒に変える
  role           TEXT NOT NULL CHECK (role IN ('ops_admin', 'ops_billing', 'ops_procurement')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER admin_role_assignments_updated_at
  BEFORE UPDATE ON public.admin_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 運営スタッフ本人が自分のロールを参照できる SELECT のみ。書き込みのポリシーは設けない
CREATE POLICY "admin_role_assignments: select own" ON public.admin_role_assignments
  FOR SELECT USING (admin_user_id = get_current_admin_user_id());
