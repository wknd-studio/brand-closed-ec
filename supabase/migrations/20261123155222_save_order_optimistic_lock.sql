-- ============================================================
-- save_order の楽観ロック（issue #721）
--
-- save_order の呼び出し側（注文のキャンセル・Checkout / Invoice の入金 Webhook 等）は、
-- ロックを取らずに読んだ注文をメモリ上で書き換え、全明細の settlement_id と全決済単位を
-- 書き戻す。読んでから書き戻すまでの間に別の書き手（請求作成等）がコミットすると、その変更が
-- 古い値で上書きされる（lost update）。orders に版の列を足し、注文の集約（注文・明細の
-- settlement_id・決済単位）を書き換える関数はすべて版を1つ進める。save_order は、呼び出し側が
-- 読んだ時点の版と今の版が違えば失敗し、何も書き換えない。
-- place_order_with_limit_check は注文を新しく作るだけで、既存の注文を書き換えないため、
-- 列の既定値（0）のまま変えない（Order.place() の版も 0）
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.version IS
  '注文の集約（注文・明細の settlement_id・決済単位）の版（楽観ロック。issue #721）。save_order・create_invoice_settlement_with_limit_check が書き換えるたびに1つ進める。save_order は、呼び出し側が読んだ時点の版と違えば失敗する。';

-- ============================================================
-- save_order: p_order.version（読んだ時点の版）を確かめてから保存し、版を1つ進める
-- 20261110215518_create_order_status_changes.sql からの変更は、版の確認と更新だけ
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_order(
  p_order jsonb,
  p_settlements jsonb,
  p_items jsonb,
  -- 状態が変わったときに記録する主体と理由:
  -- { changed_by, changed_by_admin_user_id（運営者のときだけ）, reason }
  p_status_change jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
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
$$;

COMMENT ON FUNCTION public.save_order IS
  '注文と、その決済単位・明細を1つのトランザクションで保存し、orders.status が
  変わったときだけ order_status_changes に1行追記する（issue #237）。p_order.version
  （呼び出し側が読んだ時点の版）が今の版と違えば order_version_conflict で失敗し、何も
  書き換えない。保存したら版を1つ進める（issue #721）。service role
  （管理者クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.save_order FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_order FROM anon, authenticated;

-- ============================================================
-- create_invoice_settlement_with_limit_check: 注文の版を進める
-- 20261123092913_create_invoice_settlement_with_limit_check.sql からの変更は、
-- 明細の紐付けの後の版の UPDATE（と、ロックのコメント）だけ
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
  -- 判定の前に読む注文・明細の状態を、この関数の実行中に変えさせない。
  -- この関数より前に読まれた注文の save_order は、版の不一致で失敗する（issue #721）
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

  -- 決済単位と明細の紐付けを変えたため、注文の版を進める。これより前に読まれた注文の
  -- save_order は失敗し、明細の紐付けを古い値（NULL）に戻さない（issue #721）
  UPDATE public.orders SET version = version + 1 WHERE id = p_order_id;

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
