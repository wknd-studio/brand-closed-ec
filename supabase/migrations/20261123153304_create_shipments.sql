-- ============================================================
-- shipments（新設）と order_items.shipment_id
-- docs/db-schema-redesign.md「shipments」節・移行方針ステップ10、GitHub issue #355
-- 業務ルールの正は docs/domain/fulfillment.md
--
-- 同じ注文でも商品ごとに入荷のタイミングが違うため、注文（orders）と実際に発送する箱
-- （shipments）を分け、揃った明細から先に出荷できるようにする。1つの注文に出荷は複数ありうる。
-- 1つの出荷の明細がすべて同じ fulfillment_location_code であることはアプリ層で検証する
-- ============================================================

CREATE TABLE public.shipments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID NOT NULL REFERENCES public.orders(id),
  -- pending → preparing は procurement_tasks の claimed と同じ二重対応防止の仕組み
  status                 TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'shipped', 'delivered')),
  -- 梱包に着手した運営者。pending のうちはNULL
  assigned_admin_user_id UUID REFERENCES public.admin_users(id),
  carrier                TEXT,
  tracking_number        TEXT,
  shipped_at             TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ,
  origin_location_code   TEXT NOT NULL REFERENCES public.locations(code),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX shipments_order_id_idx ON public.shipments(order_id);

-- ============================================================
-- order_items.shipment_id: どの出荷（箱）に載ったか。NULL＝未発送
-- （procurement_task_id と同じパターン）
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN shipment_id UUID REFERENCES public.shipments(id);

CREATE INDEX order_items_shipment_id_idx
  ON public.order_items(shipment_id)
  WHERE shipment_id IS NOT NULL;

-- ============================================================
-- 権限: 会員は参照だけ。運営者のID（assigned_admin_user_id）は運営の内部情報なので
-- カラム単位の権限で隠す（returns と同じ）。会員は select('*') ではなく、
-- 読めるカラムを指定して参照する
-- ============================================================

REVOKE ALL ON public.shipments FROM anon, authenticated;

GRANT SELECT (
  id, order_id, status, carrier, tracking_number,
  shipped_at, delivered_at, origin_location_code, created_at
) ON public.shipments TO authenticated;

-- ============================================================
-- RLS: 会員本人の注文に紐づく出荷の参照だけを許可する。書き込みのポリシーは作らない
-- （procurement_tasks と同じく管理画面API・service role に一本化。
-- order_items.shipment_id の更新も同じ経路）
-- ============================================================

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shipments: select own" ON public.shipments
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = get_current_user_id()
    )
  );
