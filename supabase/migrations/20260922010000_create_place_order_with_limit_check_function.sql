-- ============================================================
-- 月次仕入れ上限チェックの競合防止（行ロック）
-- docs/domain/settlement.md「月次仕入れ上限チェック」の
-- 「同一顧客の同時注文による競合の防止・完全排除」節、GitHub issue #267（親issue #220）
--
-- supabase-js（PostgREST）はリクエストをまたいだアプリケーション側トランザクションを
-- 張れない（1リクエスト＝1トランザクション）。そのため「確定済み金額を読む→判定する→
-- 注文を保存する」の一連の処理は、この関数の中で1回のDB呼び出しとして完結させる必要が
-- ある。関数の先頭でusersの対象行にFOR UPDATEの行ロックをかけることで、同一顧客の
-- 同時注文を直列化し、二重注文による月次上限超過を防ぐ。
--
-- 確定済み金額の算出ロジックは、TypeScript側のsumConfirmedAmountByUserId
-- （src/infrastructure/supabase/supabase-order-repository.ts）と同じ内容を
-- SQLで再実装している。両者は必ず同期させること。
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

  IF p_monthly_limit > 0 AND v_confirmed + p_cart_fixed_total > p_monthly_limit THEN
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

COMMENT ON FUNCTION public.place_order_with_limit_check IS
  '注文（+明細+決済単位）の新規作成を、対象ユーザー行のFOR UPDATE行ロック込みの
  1回のDB呼び出しで行う。月次上限チェックと保存をアトミックにすることで、
  同一顧客の同時注文による上限超過を防ぐ（issue #267）。service role（管理者
  クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.place_order_with_limit_check FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order_with_limit_check FROM anon, authenticated;
