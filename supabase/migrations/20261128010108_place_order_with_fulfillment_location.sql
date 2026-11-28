-- 注文確定時に、明細の発送拠点（order_items.fulfillment_location_code）を商品の設定から
-- 入れる（issue #357）。place_order_with_limit_check・save_order の明細のINSERTに列を足し、
-- #354 で暫定に置いた DEFAULT 'office' を外す（値の入れ忘れを NOT NULL で検出するため）。
-- save_order の ON CONFLICT では、スナップショットのため発送拠点を更新しない。
-- サービス未リリースで実データが無いため、既存の行のバックフィルは不要。
SET local check_function_bodies = off;

ALTER TABLE "public"."order_items"
  ALTER COLUMN "fulfillment_location_code" DROP DEFAULT;

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
    id, user_id, order_number, status,
    shipping_address_snapshot, billing_address_snapshot,
    rank_at_order, monthly_limit_at_order, created_at, version
  )
  VALUES (
    v_order_id,
    (p_order->>'user_id')::uuid,
    p_order->>'order_number',
    p_order->>'status',
    p_order->'shipping_address_snapshot',
    p_order->'billing_address_snapshot',
    (p_order->>'rank_at_order')::public.member_rank,
    (p_order->>'monthly_limit_at_order')::bigint,
    (p_order->>'created_at')::timestamptz,
    v_expected_version + 1
  )
  -- 注文番号は注文を作るときに決まり、書き換えでは変えないため更新しない
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
    payment_timing, fulfillment_location_code, settlement_id
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
    item->>'fulfillment_location_code',
    (item->>'settlement_id')::uuid
  FROM jsonb_array_elements(p_items) AS item
  -- 発送拠点は注文確定時点のスナップショットのため、保存し直しでは書き換えない（#357）
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

COMMENT ON COLUMN "public"."order_items"."fulfillment_location_code" IS 'この明細が事務所経由（office）か仕入れ先直送（supplier_direct）かの、注文時点のスナップショット。注文確定時に商品の設定から必ず入れるため既定値は置かない（#357）。';
