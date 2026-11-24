CREATE OR REPLACE FUNCTION public.save_order (
  p_order         jsonb,
  p_settlements   jsonb,
  p_items         jsonb,
  p_status_change jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_order_id uuid := (p_order->>'id')::uuid;
  -- 呼び出し側が注文を読んだ時点の版（新しい注文は 0）
  v_expected_version bigint := (p_order->>'version')::bigint;
  v_from_status text;
  v_current_version bigint;
BEGIN
  IF v_expected_version IS NULL THEN
    RAISE EXCEPTION 'save_order: version is required' USING ERRCODE = 'P0001';
  END IF;

  -- 同じ注文の同時保存（Webhook と運営者のキャンセル等）で変更前の状態を読み違えないよう、
  -- 注文の行をロックしてから読む。注文がまだ無ければ NULL（最初の1行になる）
  SELECT status, version INTO v_from_status, v_current_version
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  -- 呼び出し側はロックを取らずに読んだ注文を書き戻すため、読んだ時点からこの注文が
  -- 変わっていれば（請求作成・別の save_order がコミットした）、古い値で上書きせずに失敗する。
  -- 何も書き換えないため、呼び出し側は読み直してやり直せる（issue #721）
  IF v_current_version IS DISTINCT FROM v_expected_version
     AND NOT (v_current_version IS NULL AND v_expected_version = 0) THEN
    RAISE EXCEPTION 'order_version_conflict: order=%, expected=%, actual=%',
      v_order_id, v_expected_version, v_current_version
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.orders (
    id, user_id, status,
    shipping_address_snapshot, billing_address_snapshot,
    rank_at_order, monthly_limit_at_order, created_at, version
  )
  VALUES (
    v_order_id,
    (p_order->>'user_id')::uuid,
    p_order->>'status',
    p_order->'shipping_address_snapshot',
    p_order->'billing_address_snapshot',
    (p_order->>'rank_at_order')::public.member_rank,
    (p_order->>'monthly_limit_at_order')::bigint,
    (p_order->>'created_at')::timestamptz,
    v_expected_version + 1
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    status = EXCLUDED.status,
    shipping_address_snapshot = EXCLUDED.shipping_address_snapshot,
    billing_address_snapshot = EXCLUDED.billing_address_snapshot,
    rank_at_order = EXCLUDED.rank_at_order,
    monthly_limit_at_order = EXCLUDED.monthly_limit_at_order,
    created_at = EXCLUDED.created_at,
    version = EXCLUDED.version;

  -- order_items.settlement_id の外部キーがあるため、決済単位を明細より先に保存する
  INSERT INTO public.order_settlements (
    id, order_id, flow, status,
    stripe_checkout_session_id, stripe_invoice_id, amount_snapshot,
    paid_at, cancelled_at
  )
  SELECT
    (s->>'id')::uuid,
    (s->>'order_id')::uuid,
    s->>'flow',
    s->>'status',
    s->>'stripe_checkout_session_id',
    s->>'stripe_invoice_id',
    (s->>'amount_snapshot')::bigint,
    (s->>'paid_at')::timestamptz,
    (s->>'cancelled_at')::timestamptz
  FROM jsonb_array_elements(p_settlements) AS s
  ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    flow = EXCLUDED.flow,
    status = EXCLUDED.status,
    stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
    stripe_invoice_id = EXCLUDED.stripe_invoice_id,
    amount_snapshot = EXCLUDED.amount_snapshot,
    paid_at = EXCLUDED.paid_at,
    cancelled_at = EXCLUDED.cancelled_at;

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
    (item->>'unit_price_snapshot')::bigint,
    (item->>'quantity')::int,
    (item->>'is_negotiable')::boolean,
    (item->>'negotiated_unit_price')::bigint,
    item->>'payment_timing',
    (item->>'settlement_id')::uuid
  FROM jsonb_array_elements(p_items) AS item
  ON CONFLICT (id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    sanity_product_id = EXCLUDED.sanity_product_id,
    product_name_snapshot = EXCLUDED.product_name_snapshot,
    unit_price_snapshot = EXCLUDED.unit_price_snapshot,
    quantity = EXCLUDED.quantity,
    is_negotiable = EXCLUDED.is_negotiable,
    negotiated_unit_price = EXCLUDED.negotiated_unit_price,
    payment_timing = EXCLUDED.payment_timing,
    settlement_id = EXCLUDED.settlement_id;

  IF v_from_status IS DISTINCT FROM p_order->>'status' THEN
    INSERT INTO public.order_status_changes (
      order_id, from_status, to_status,
      changed_by, changed_by_admin_user_id, reason
    )
    VALUES (
      v_order_id, v_from_status, p_order->>'status',
      p_status_change->>'changed_by',
      (p_status_change->>'changed_by_admin_user_id')::uuid,
      p_status_change->>'reason'
    );
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."save_order"(jsonb, jsonb, jsonb, jsonb) TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."save_order"(jsonb, jsonb, jsonb, jsonb) IS '注文と、その決済単位・明細を1つのトランザクションで保存し、orders.status が
  変わったときだけ order_status_changes に1行追記する（issue #237）。p_order.version
  （呼び出し側が読んだ時点の版）が今の版と違えば order_version_conflict で失敗し、何も
  書き換えない。保存したら版を1つ進める（issue #721）。service role
  （管理者クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION "public"."save_order"(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
