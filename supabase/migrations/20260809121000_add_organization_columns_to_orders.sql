-- 法人会員（B2B）対応: ordersテーブルへの組織関連カラム追加
-- specs/005-b2b-organization/data-model.md の設計に基づく

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'pending_payment';

ALTER TABLE public.orders
  ADD COLUMN organization_id      UUID REFERENCES public.organizations(id),
  ADD COLUMN requested_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN approval_status      TEXT
    CHECK (approval_status IN ('auto_approved', 'pending_approval', 'approved', 'rejected')),
  ADD COLUMN approved_by_user_id  UUID REFERENCES public.users(id),
  ADD COLUMN approved_at          TIMESTAMPTZ;

CREATE INDEX orders_organization_id_idx
  ON public.orders(organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX orders_organization_pending_approval_idx
  ON public.orders(organization_id, approval_status)
  WHERE approval_status = 'pending_approval';
