CREATE OR REPLACE FUNCTION public.place_order_with_limit_check (
  p_user_id          uuid,
  p_period_start     timestamp with time zone,
  p_period_end       timestamp with time zone,
  p_monthly_limit    bigint,
  p_cart_fixed_total bigint,
  p_order            jsonb,
  p_items            jsonb,
  p_settlement       jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_confirmed bigint;
BEGIN
  -- 同一顧客の同時注文・請求作成を直列化する行ロック
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  v_confirmed := public.confirmed_amount_in_period(p_user_id, p_period_start, p_period_end);

  -- 上限が NULL（無制限）のときだけ判定しない。上限0は上限0として扱う
  IF p_monthly_limit IS NOT NULL AND v_confirmed + p_cart_fixed_total > p_monthly_limit THEN
    RAISE EXCEPTION 'monthly_limit_exceeded: attempted=%, limit=%',
      v_confirmed + p_cart_fixed_total, p_monthly_limit
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.orders (
    id, user_id, order_number, status,
    shipping_address_snapshot, billing_address_snapshot,
    rank_at_order, monthly_limit_at_order, created_at
  )
  SELECT
    (p_order->>'id')::uuid,
    (p_order->>'user_id')::uuid,
    p_order->>'order_number',
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
    payment_timing, fulfillment_location_code, settlement_id
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
    item->>'fulfillment_location_code',
    NULLIF(item->>'settlement_id', '')::uuid
  FROM jsonb_array_elements(p_items) AS item;
END;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."place_order_with_limit_check"(uuid, timestamp WITH time zone, timestamp WITH time zone, bigint, bigint, jsonb, jsonb, jsonb)
  TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."place_order_with_limit_check"(uuid, timestamp with time zone, timestamp
  with time zone, bigint, bigint, jsonb, jsonb, jsonb) IS '注文（+明細+決済単位）の新規作成を、対象ユーザー行のFOR UPDATE行ロック込みの
  1回のDB呼び出しで行う。月次上限チェックと保存をアトミックにすることで、
  同一顧客の同時注文による上限超過を防ぐ（issue #267）。service role（管理者
  クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION "public"."place_order_with_limit_check"(uuid, timestamp WITH time zone, timestamp WITH time zone, bigint, bigint, jsonb, jsonb, jsonb) FROM PUBLIC;
