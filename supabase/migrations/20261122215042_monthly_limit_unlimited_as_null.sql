-- ============================================================
-- 月間仕入れ上限の「無制限」を NULL で表す（issue #210）
--
-- 上限の金額の正は member_ranks.monthly_limit_amount（NULL = 無制限）。アプリは
-- これまで enterprise を Number.MAX_SAFE_INTEGER で表していたが、テーブル定義
-- （docs/db-schema-redesign.md）に合わせて、注文時の上限と DB 関数の引数も NULL を
-- 無制限として扱う
-- ============================================================

-- 無制限のランク（enterprise）の注文は、注文時の上限を NULL で保存する
ALTER TABLE public.orders
  ALTER COLUMN monthly_limit_at_order DROP NOT NULL;

COMMENT ON COLUMN public.orders.monthly_limit_at_order IS
  '注文時点の月間仕入れ上限（円）のスナップショット。NULL = 無制限（member_ranks.monthly_limit_amount と同じ表し方）。';

-- ============================================================
-- place_order_with_limit_check: p_monthly_limit が NULL なら上限の判定をしない
-- 20261110215518_create_order_status_changes.sql からの変更は、上限の判定の条件
-- （p_monthly_limit > 0 → p_monthly_limit IS NOT NULL）だけ
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_order_with_limit_check(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_monthly_limit bigint,
  p_cart_fixed_total bigint,
  p_order jsonb,
  p_items jsonb,
  p_settlement jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_confirmed bigint;
BEGIN
  -- 同一顧客の同時注文を直列化する行ロック
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- 「今月すでに確定している金額」の算出（sumConfirmedAmountByUserIdと同じロジック）:
  -- 注文自体がキャンセルされておらず、明細自身が紐づく決済単位もキャンセルされていない
  -- 明細（決済単位が未作成のNULLも含む）の合計
  SELECT COALESCE(SUM(oi.quantity * oi.unit_price_snapshot), 0)
  INTO v_confirmed
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.order_settlements os ON os.id = oi.settlement_id
  WHERE o.user_id = p_user_id
    AND o.status <> 'cancelled'
    AND o.created_at >= p_period_start
    AND o.created_at < p_period_end
    AND oi.unit_price_snapshot IS NOT NULL
    AND (os.id IS NULL OR os.status <> 'cancelled');

  -- 上限が NULL（無制限）のときだけ判定しない。上限0は上限0として扱う
  IF p_monthly_limit IS NOT NULL AND v_confirmed + p_cart_fixed_total > p_monthly_limit THEN
    RAISE EXCEPTION 'monthly_limit_exceeded: attempted=%, limit=%',
      v_confirmed + p_cart_fixed_total, p_monthly_limit
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.orders (
    id, user_id, status,
    shipping_address_snapshot, billing_address_snapshot,
    rank_at_order, monthly_limit_at_order, created_at
  )
  SELECT
    (p_order->>'id')::uuid,
    (p_order->>'user_id')::uuid,
    p_order->>'status',
    p_order->'shipping_address_snapshot',
    p_order->'billing_address_snapshot',
    (p_order->>'rank_at_order')::public.member_rank,
    (p_order->>'monthly_limit_at_order')::bigint,
    (p_order->>'created_at')::timestamptz;

  -- 注文確定は会員の操作のため changed_by = 'customer'（issue #237）
  INSERT INTO public.order_status_changes (order_id, from_status, to_status, changed_by)
  VALUES ((p_order->>'id')::uuid, NULL, p_order->>'status', 'customer');

  IF p_settlement IS NOT NULL THEN
    INSERT INTO public.order_settlements (
      id, order_id, flow, status,
      stripe_checkout_session_id, stripe_invoice_id, amount_snapshot
    )
    SELECT
      (p_settlement->>'id')::uuid,
      (p_settlement->>'order_id')::uuid,
      p_settlement->>'flow',
      p_settlement->>'status',
      p_settlement->>'stripe_checkout_session_id',
      p_settlement->>'stripe_invoice_id',
      (p_settlement->>'amount_snapshot')::bigint;
  END IF;

  INSERT INTO public.order_items (
    id, order_id, sanity_product_id, product_name_snapshot,
    unit_price_snapshot, quantity, is_negotiable, negotiated_unit_price,
    payment_timing, settlement_id
  )
  SELECT
    (item->>'id')::uuid,
    (item->>'order_id')::uuid,
    item->>'sanity_product_id',
    item->>'product_name_snapshot',
    NULLIF(item->>'unit_price_snapshot', '')::bigint,
    (item->>'quantity')::int,
    (item->>'is_negotiable')::boolean,
    NULLIF(item->>'negotiated_unit_price', '')::bigint,
    item->>'payment_timing',
    NULLIF(item->>'settlement_id', '')::uuid
  FROM jsonb_array_elements(p_items) AS item;
END;
$$;
