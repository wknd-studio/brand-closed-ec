-- ============================================================
-- 発注管理: procurement_tasks新設・order_items.procurement_task_id/received_at追加
-- docs/db-schema-redesign.md「移行方針」9番・docs/domain/procurement.md
-- GitHub issue #226（親issue #165）
-- ============================================================

-- ============================================================
-- procurement_tasks
-- ============================================================

CREATE TABLE public.procurement_tasks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                 TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'ordered', 'cancelled')),
  assigned_admin_user_id UUID REFERENCES public.admin_users(id),
  ordered_at             TIMESTAMPTZ,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.procurement_tasks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER procurement_tasks_updated_at
  BEFORE UPDATE ON public.procurement_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 顧客はこのテーブルを一切参照できない（発注業務は運営内部の情報）。
-- 運営スタッフ向けのSELECT/INSERT/UPDATEはRLSポリシーを積み増さず、
-- 管理画面API（service role経由）に一本化する。
-- ユーザー向けポリシーは設けない。

-- ============================================================
-- order_items: procurement_task_id / received_at追加
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN procurement_task_id UUID REFERENCES public.procurement_tasks(id),
  ADD COLUMN received_at         TIMESTAMPTZ;

CREATE INDEX order_items_procurement_task_id_idx
  ON public.order_items(procurement_task_id)
  WHERE procurement_task_id IS NOT NULL;
