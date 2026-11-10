-- ============================================================
-- order_status_changes（新設・追記専用）と、注文の保存の関数化
-- docs/db-schema-redesign.md「order_status_changes」節・移行方針ステップ11、GitHub issue #237
--
-- orders.status は現在値しか持たず、いつ・誰が・なぜ変えたかを後から追えない。
-- rank_changes と同じく、orders.status の更新は必ずこのテーブルへの INSERT と
-- 同じトランザクションで行う。supabase-js（PostgREST）は1リクエスト＝1トランザクション
-- のため、注文の保存（状態の更新＋履歴の INSERT）を DB 関数 save_order にまとめる。
-- ============================================================

CREATE TABLE public.order_status_changes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 注文確定の補償削除（delete_order）で注文ごと消すため、注文の削除に合わせて消す
  order_id                  UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status               TEXT,
  to_status                 TEXT NOT NULL,
  changed_by                TEXT NOT NULL CHECK (changed_by IN ('customer', 'admin', 'system')),
  changed_by_admin_user_id  UUID REFERENCES public.admin_users(id),
  reason                    TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 運営者の操作なら誰が変えたかを必ず残し、それ以外には運営者を付けない
  CONSTRAINT order_status_changes_admin_user_check
    CHECK ((changed_by = 'admin') = (changed_by_admin_user_id IS NOT NULL))
);

COMMENT ON TABLE public.order_status_changes IS
  'orders.status の変更の追記専用の来歴（issue #237）。UPDATE/DELETE はトリガーで拒否する（注文の削除に伴うカスケードだけは通す）。orders.status の更新は、必ずこのテーブルへの INSERT と同じトランザクションで行う（save_order・place_order_with_limit_check）。';

CREATE INDEX order_status_changes_order_id_idx
  ON public.order_status_changes(order_id);

-- service role も含めて UPDATE・DELETE を拒否する。注文の削除（delete_order）に伴う
-- ON DELETE CASCADE は、カスケードの時点で親の注文が既に消えているため通す
CREATE OR REPLACE FUNCTION public.prevent_order_status_changes_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = OLD.order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'order_status_changes は追記専用のため % できません', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER order_status_changes_append_only
  BEFORE UPDATE OR DELETE ON public.order_status_changes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_status_changes_modification();

ALTER TABLE public.order_status_changes ENABLE ROW LEVEL SECURITY;

-- 参照は自分の注文の履歴のみ。追記は save_order・place_order_with_limit_check
-- （service role）からだけ行うため、INSERT/UPDATE/DELETE のポリシーは設けない
CREATE POLICY "order_status_changes: select own" ON public.order_status_changes
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = get_current_user_id()
    )
  );

-- ============================================================
-- save_order: 注文（+決済単位+明細）を保存し、orders.status が変わったときだけ
-- 履歴を1行追記する。どこかで失敗すれば全体がロールバックされる
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
  v_from_status text;
BEGIN
  -- 同じ注文の同時保存（Webhook と運営者のキャンセル等）で変更前の状態を読み違えないよう、
  -- 注文の行をロックしてから読む。注文がまだ無ければ NULL（最初の1行になる）
  SELECT status INTO v_from_status
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  INSERT INTO public.orders (
    id, user_id, status,
    shipping_address_snapshot, billing_address_snapshot,
    rank_at_order, monthly_limit_at_order, created_at
  )
  VALUES (
    v_order_id,
    (p_order->>'user_id')::uuid,
    p_order->>'status',
    p_order->'shipping_address_snapshot',
    p_order->'billing_address_snapshot',
    (p_order->>'rank_at_order')::public.member_rank,
    (p_order->>'monthly_limit_at_order')::bigint,
    (p_order->>'created_at')::timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    status = EXCLUDED.status,
    shipping_address_snapshot = EXCLUDED.shipping_address_snapshot,
    billing_address_snapshot = EXCLUDED.billing_address_snapshot,
    rank_at_order = EXCLUDED.rank_at_order,
    monthly_limit_at_order = EXCLUDED.monthly_limit_at_order,
    created_at = EXCLUDED.created_at;

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
  変わったときだけ order_status_changes に1行追記する（issue #237）。service role
  （管理者クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.save_order FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_order FROM anon, authenticated;

-- ============================================================
-- place_order_with_limit_check: 注文確定時に最初の1行（from_status = NULL）を記録する
-- 20260922010000_create_place_order_with_limit_check_function.sql からの変更は、
-- orders の INSERT の直後の order_status_changes の INSERT だけ
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
