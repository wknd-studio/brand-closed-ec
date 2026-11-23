-- ============================================================
-- 請求作成の月次上限チェックと決済単位の作成を DB 関数で原子化する（issue #393、親 issue #224）
--
-- 請求作成は「今月すでに確定している金額を読む → 上限と比べる → 決済単位を作り明細の
-- settlement_id を更新する」を、同じ顧客の注文確定と競合しないように直列化する必要がある
-- （docs/domain/settlement.md「同一顧客の同時注文による競合の防止・完全排除」）。
-- supabase-js は複数クエリのトランザクションを張れないため、place_order_with_limit_check と
-- 同じく1回の関数呼び出しで完結させる。確定額の集計は両方の関数で同じでなければならないため、
-- 別の関数に切り出して共有する
-- ============================================================

-- ============================================================
-- confirmed_amount_in_period: 期間内に「すでに確定している金額」
-- （SupabaseOrderRepository.sumConfirmedAmountByUserId と同じロジック）。
-- 注文自体がキャンセルされておらず、明細自身が紐づく決済単位もキャンセルされていない
-- 明細（決済単位が未作成の NULL も含む）の合計。p_excluded_item_ids の明細は数えない
-- （請求作成で、選んだ明細を「それ以外の確定額」と分けて数えるため）
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirmed_amount_in_period(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_excluded_item_ids uuid[] DEFAULT '{}'
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(oi.quantity * oi.unit_price_snapshot), 0)::bigint
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.order_settlements os ON os.id = oi.settlement_id
  WHERE o.user_id = p_user_id
    AND o.status <> 'cancelled'
    AND o.created_at >= p_period_start
    AND o.created_at < p_period_end
    AND oi.unit_price_snapshot IS NOT NULL
    AND (os.id IS NULL OR os.status <> 'cancelled')
    AND oi.id <> ALL (p_excluded_item_ids);
$$;

REVOKE ALL ON FUNCTION public.confirmed_amount_in_period FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmed_amount_in_period FROM anon, authenticated;

-- ============================================================
-- place_order_with_limit_check: 確定額の集計を confirmed_amount_in_period に置き換える
-- 20261122215042_monthly_limit_unlimited_as_null.sql からの変更は、集計の SELECT だけ
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

-- ============================================================
-- create_invoice_settlement_with_limit_check: 1つの注文の未請求の後払い明細から
-- invoice の決済単位を作る。判定は all-or-nothing で、選んだ明細の合計＋それ以外の
-- 確定額が上限を超えれば limit_exceeded、超えなければ invoice_sent の決済単位にする
-- （どちらでも選んだ明細はすべてその決済単位に紐付ける）。作った決済単位の status を返す。
-- Stripe Invoice は作らない（invoice_sent のときだけ、呼び出し側がこの後に発行して紐付ける）。
-- 請求できない明細が1件でもあれば例外にし、何も変えない
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_invoice_settlement_with_limit_check(
  p_order_id uuid,
  p_item_ids uuid[],
  p_settlement_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  -- NULL = 無制限（上限の判定をしない）
  p_monthly_limit bigint,
  -- 請求作成を実行した運営者（orders.status が変わったときの履歴に残す）
  p_admin_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_order_status text;
  v_selected_total bigint;
  v_confirmed bigint;
  v_status text;
BEGIN
  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: no_items' USING ERRCODE = 'P0001';
  END IF;

  SELECT user_id INTO v_user_id FROM public.orders WHERE id = p_order_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: order_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- 同一顧客の注文確定・請求作成を直列化する行ロック（place_order_with_limit_check と同じ行）
  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  -- 同じ注文の保存（save_order。注文のキャンセル・Webhook 等）とも直列化する
  SELECT status INTO v_order_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  PERFORM 1 FROM public.order_items WHERE id = ANY (p_item_ids) FOR UPDATE;

  IF v_order_status = 'cancelled' THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: order_cancelled' USING ERRCODE = 'P0001';
  END IF;

  -- 1回の請求は1注文の明細に限る（order_settlements.order_id が1注文を指すため）
  IF EXISTS (
    SELECT 1 FROM unnest(p_item_ids) AS selected(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.id = selected.id AND oi.order_id = p_order_id
    )
  ) THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: item_not_in_order' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE id = ANY (p_item_ids) AND payment_timing <> 'after_order'
  ) THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: not_after_order' USING ERRCODE = 'P0001';
  END IF;

  -- 決済単位をキャンセルした明細は settlement_id が NULL に戻るため、NULL だけを未請求とみなす
  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE id = ANY (p_item_ids) AND settlement_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: already_settled' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE id = ANY (p_item_ids) AND unit_price_snapshot IS NULL
  ) THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: price_not_fixed' USING ERRCODE = 'P0001';
  END IF;

  SELECT SUM(quantity * unit_price_snapshot)::bigint
  INTO v_selected_total
  FROM public.order_items
  WHERE id = ANY (p_item_ids);

  -- 未請求の後払い明細はすでに確定額に入っているため、選んだ明細を除いて数えてから足す
  -- （期間外の注文の明細でも、選んだ明細の金額は必ず1回だけ数える）
  v_confirmed := public.confirmed_amount_in_period(
    v_user_id, p_period_start, p_period_end, p_item_ids
  );

  -- 上限が NULL（無制限）のときだけ判定しない。上限0は上限0として扱う
  IF p_monthly_limit IS NOT NULL AND v_confirmed + v_selected_total > p_monthly_limit THEN
    v_status := 'limit_exceeded';
  ELSE
    v_status := 'invoice_sent';
  END IF;

  INSERT INTO public.order_settlements (id, order_id, flow, status, amount_snapshot)
  VALUES (p_settlement_id, p_order_id, 'invoice', v_status, v_selected_total);

  UPDATE public.order_items
  SET settlement_id = p_settlement_id
  WHERE id = ANY (p_item_ids);

  -- orders.status のロールアップ（Order.rollupStatus()。docs/domain/settlement.md
  -- 「orders.statusのロールアップ算出」）のうち、決済単位を1件足したときに変わりうるのは
  -- 「limit_exceeded の決済単位がある → limit_exceeded」だけ。invoice_sent は未払いの
  -- 決済単位が増えるだけで、未請求の明細があった注文が paid になることは無い
  IF v_status = 'limit_exceeded' AND v_order_status <> 'limit_exceeded' THEN
    UPDATE public.orders SET status = 'limit_exceeded' WHERE id = p_order_id;

    INSERT INTO public.order_status_changes (
      order_id, from_status, to_status, changed_by, changed_by_admin_user_id
    )
    VALUES (p_order_id, v_order_status, 'limit_exceeded', 'admin', p_admin_user_id);
  END IF;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_settlement_with_limit_check FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice_settlement_with_limit_check FROM anon, authenticated;
