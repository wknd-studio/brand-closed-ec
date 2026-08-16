-- ============================================================
-- orders.status / orders.payment_flowをENUM→TEXT+CHECKへ変更する
-- docs/db-schema-redesign.md「移行方針」4番の設計に基づく
-- GitHub issue #168（親issue #165）
--
-- pre-launchのため実データが無く（develop/stg含む）、無停止移行の段階的
-- 手順は不要（親issue #165の方針）。ALTER TABLEで直接カラムの型を差し替え、
-- 対応するCHECK制約を追加する。値の集合は現行ENUM（'limit_exceeded'
-- 追加(20260603173357)・'pending_approval'追加(20260809121000)含む）を
-- そのまま踏襲する。'shipping'/'delivered'/'sourcing'/'ordered'/
-- 'preparing'の除去はshipments新設時のステップ9（#173）で行う。
-- ============================================================

ALTER TABLE public.orders
  ALTER COLUMN status TYPE TEXT USING status::TEXT;

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'pending_payment';

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending_approval', 'pending_payment', 'confirming', 'limit_exceeded',
    'invoice_sent', 'paid', 'sourcing', 'ordered', 'preparing',
    'shipping', 'delivered', 'cancelled'
  ));

ALTER TABLE public.orders
  ALTER COLUMN payment_flow TYPE TEXT USING payment_flow::TEXT;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_flow_check
  CHECK (payment_flow IN ('checkout', 'invoice'));

DROP TYPE public.order_status;
DROP TYPE public.order_payment_flow;

COMMENT ON COLUMN public.orders.status IS
  '注文状態。旧order_status ENUM列を置き換え（TEXT+CHECK）。shipping系の値
  （shipping/delivered/sourcing/ordered/preparing）はshipments新設(#173)
  時にCHECKから除去予定。';
COMMENT ON COLUMN public.orders.payment_flow IS
  '決済フロー（checkout/invoice）。旧order_payment_flow ENUM列を置き換え。';
