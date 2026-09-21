-- ============================================================
-- order_settlements（決済単位）新設と、ordersからの決済関連列の分離
-- docs/db-schema-redesign.md「移行方針」8番の設計に基づく
-- GitHub issue #219（親issue #165）
--
-- 決済状態をordersではなくorder_itemsが参照する子エンティティ
-- （order_settlements）に持たせ、ordersは常に1回のチェックアウト操作＝1行に
-- 保つ。法人組織の注文承認フロー（2026-09-14廃止）関連の列もここで削除する。
--
-- pre-launchで実データは無い想定だが、万一既存行があっても壊れないよう
-- 既存ordersからorder_settlements・order_items.payment_timingをバックフィル
-- してから列を削除する。
-- ============================================================

-- ------------------------------------------------------------
-- 1. order_settlements
-- ------------------------------------------------------------

CREATE TABLE public.order_settlements (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                   UUID NOT NULL REFERENCES public.orders(id),
  flow                       TEXT NOT NULL
    CHECK (flow IN ('checkout', 'invoice')),
  status                     TEXT NOT NULL
    CHECK (status IN (
      'pending_payment', 'invoice_sent', 'limit_exceeded', 'paid', 'cancelled'
    )),
  stripe_checkout_session_id TEXT,
  stripe_invoice_id          TEXT,
  amount_snapshot            BIGINT NOT NULL,
  paid_at                    TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_settlements_order_id_idx
  ON public.order_settlements(order_id);
CREATE UNIQUE INDEX order_settlements_stripe_checkout_session_id_key
  ON public.order_settlements(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX order_settlements_stripe_invoice_id_key
  ON public.order_settlements(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE TRIGGER order_settlements_updated_at
  BEFORE UPDATE ON public.order_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.order_settlements ENABLE ROW LEVEL SECURITY;

-- 書き込みはStripe Webhookハンドラー・「請求作成」ユースケース（service role）
-- 経由のみ。ユーザー向けINSERT/UPDATE/DELETEポリシーは設けない。
CREATE POLICY "order_settlements: select own" ON public.order_settlements
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "order_settlements: select same org" ON public.order_settlements
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE organization_id IS NOT NULL
        AND organization_id IN (SELECT get_current_org_ids())
    )
  );

-- ------------------------------------------------------------
-- 2. order_items: payment_timing / settlement_id追加
-- ------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN payment_timing TEXT,
  ADD COLUMN settlement_id  UUID REFERENCES public.order_settlements(id);

CREATE INDEX order_items_settlement_id_idx
  ON public.order_items(settlement_id)
  WHERE settlement_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. 既存データのバックフィル（ordersの旧列を削除する前に実施）
-- ------------------------------------------------------------

-- 旧payment_flow: checkout→at_order（注文時払い）、invoice→after_order（注文後払い）
UPDATE public.order_items oi
SET payment_timing = CASE o.payment_flow
  WHEN 'invoice' THEN 'after_order'
  ELSE 'at_order'
END
FROM public.orders o
WHERE o.id = oi.order_id;

-- 旧invoiceフローで請求書が未発行の状態（承認待ち・支払い待ち・上限確認中）の
-- 注文は、新設計では「決済単位が未作成（明細のsettlement_idがNULL）」に相当する
-- ため、決済単位を作らない。それ以外は旧ordersの1行を1決済単位として移行する。
INSERT INTO public.order_settlements (
  order_id, flow, status,
  stripe_checkout_session_id, stripe_invoice_id,
  amount_snapshot, paid_at, cancelled_at, created_at
)
SELECT
  o.id,
  o.payment_flow,
  CASE
    WHEN o.status = 'cancelled' THEN 'cancelled'
    WHEN o.status = 'limit_exceeded' THEN 'limit_exceeded'
    WHEN o.status = 'invoice_sent' THEN 'invoice_sent'
    WHEN o.status IN ('paid', 'sourcing', 'ordered', 'preparing', 'shipping', 'delivered')
      THEN 'paid'
    ELSE 'pending_payment'
  END,
  o.stripe_checkout_session_id,
  o.stripe_invoice_id,
  COALESCE((
    SELECT SUM(oi.quantity * COALESCE(oi.negotiated_unit_price, oi.unit_price_snapshot, 0))
    FROM public.order_items oi
    WHERE oi.order_id = o.id
  ), 0),
  CASE WHEN o.status IN ('paid', 'sourcing', 'ordered', 'preparing', 'shipping', 'delivered')
    THEN o.updated_at END,
  CASE WHEN o.status = 'cancelled' THEN o.updated_at END,
  o.created_at
FROM public.orders o
WHERE NOT (
  o.payment_flow = 'invoice'
  AND o.status IN ('pending_approval', 'pending_payment', 'confirming')
);

UPDATE public.order_items oi
SET settlement_id = s.id
FROM public.order_settlements s
WHERE s.order_id = oi.order_id;

-- ------------------------------------------------------------
-- 4. order_items.payment_timingを確定（NOT NULL + CHECK）
-- ------------------------------------------------------------

ALTER TABLE public.order_items
  ALTER COLUMN payment_timing SET NOT NULL;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_payment_timing_check
  CHECK (payment_timing IN ('at_order', 'after_order'));

-- ------------------------------------------------------------
-- 5. orders.statusをロールアップ値の4値に変更
-- ------------------------------------------------------------

ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;

UPDATE public.orders
SET status = CASE
  WHEN status = 'cancelled' THEN 'cancelled'
  WHEN status = 'limit_exceeded' THEN 'limit_exceeded'
  WHEN status IN ('paid', 'sourcing', 'ordered', 'preparing', 'shipping', 'delivered')
    THEN 'paid'
  ELSE 'processing'
END;

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'processing';

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('cancelled', 'processing', 'limit_exceeded', 'paid'));

COMMENT ON COLUMN public.orders.status IS
  '表示用のロールアップ値。配下のorder_settlements・order_itemsから都度算出して
  書き戻す（正のデータではない）。直接書き込むのはcancelled（決済単位が1件も
  作られる前のキャンセル）のみ。';

-- ------------------------------------------------------------
-- 6. ordersから決済関連・承認フロー関連の列を削除
-- （関連するCHECK制約・インデックスは列と一緒に削除される）
-- ------------------------------------------------------------

ALTER TABLE public.orders
  DROP COLUMN payment_flow,
  DROP COLUMN requested_by_user_id,
  DROP COLUMN approved_by_user_id,
  DROP COLUMN approval_status,
  DROP COLUMN approved_at,
  DROP COLUMN stripe_checkout_session_id,
  DROP COLUMN stripe_invoice_id,
  DROP COLUMN split_group_id;

-- procurement_due_atは現行スキーマにも存在しない（配送SLA廃止済み）ため何もしない
