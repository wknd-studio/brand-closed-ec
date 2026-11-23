-- ============================================================
-- returns / return_items（新設）
-- docs/db-schema-redesign.md「returns」「return_items」節・移行方針ステップ12、GitHub issue #232
-- 業務ルールの正は docs/domain/returns.md
--
-- 注文確定後のキャンセル（パターン②）・返品（パターン③）・回収不能処理を
-- 「申請」という1つの出来事として記録する。会員からの書き込みは requested の申請の
-- INSERT だけで、承認・却下・返金の記録は管理画面API（service role）に一本化する
-- ============================================================

CREATE TABLE public.returns (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID NOT NULL REFERENCES public.orders(id),
  status                    TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'received', 'refunded', 'cancelled')),
  -- 会員の申請なら申請した会員、回収不能処理（運営者が requested を経ずに直接作る）なら
  -- 起票した運営者。どちらの経路でも誰が起票したかを追えるよう、どちらか一方だけを持つ
  requested_by_user_id      UUID REFERENCES public.users(id),
  created_by_admin_user_id  UUID REFERENCES public.admin_users(id),
  reviewed_by_admin_user_id UUID REFERENCES public.admin_users(id),
  reason                    TEXT NOT NULL,
  admin_note                TEXT,
  stripe_refund_id          TEXT UNIQUE,
  refund_amount             BIGINT CHECK (refund_amount >= 0),
  approved_at               TIMESTAMPTZ,
  received_at               TIMESTAMPTZ,
  refunded_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT returns_requester_check
    CHECK (num_nonnulls(requested_by_user_id, created_by_admin_user_id) = 1)
);

CREATE INDEX returns_order_id_idx ON public.returns(order_id);
CREATE INDEX returns_requested_by_user_id_idx
  ON public.returns(requested_by_user_id)
  WHERE requested_by_user_id IS NOT NULL;

CREATE TRIGGER returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.return_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 明細は申請の一部なので、申請と一緒に消す
  return_id     UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id),
  -- order_items.quantity 以下であることはアプリ層で検証する
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  -- order_items.unit_price_snapshot × quantity（送料は含めない）。返金確定前はNULL
  refund_amount BIGINT CHECK (refund_amount >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX return_items_return_id_idx ON public.return_items(return_id);
CREATE INDEX return_items_order_item_id_idx ON public.return_items(order_item_id);

-- ============================================================
-- 権限: RLS は行単位なので、運営の内部情報（admin_note・運営者のID）の秘匿と、
-- 会員が運営の記録する項目を入れられないことは、カラム単位の権限で守る。
-- 会員は select('*') ではなく、読めるカラムを指定して参照する
-- ============================================================

REVOKE ALL ON public.returns FROM anon, authenticated;
REVOKE ALL ON public.return_items FROM anon, authenticated;

GRANT SELECT (
  id, order_id, status, requested_by_user_id, reason,
  stripe_refund_id, refund_amount, approved_at, received_at, refunded_at,
  created_at, updated_at
) ON public.returns TO authenticated;
GRANT INSERT (id, order_id, status, requested_by_user_id, reason)
  ON public.returns TO authenticated;

GRANT SELECT (id, return_id, order_item_id, quantity, refund_amount, created_at)
  ON public.return_items TO authenticated;
GRANT INSERT (id, return_id, order_item_id, quantity)
  ON public.return_items TO authenticated;

-- ============================================================
-- RLS: 会員本人の注文に対する申請の参照と、requested の申請のINSERTだけを許可する。
-- 運営者向けのポリシーは作らない（管理画面API・service role に一本化）
-- ============================================================

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns: select own" ON public.returns
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "returns: insert own requested" ON public.returns
  FOR INSERT WITH CHECK (
    status = 'requested'
    AND requested_by_user_id = get_current_user_id()
    AND order_id IN (
      SELECT id FROM public.orders WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "return_items: select own" ON public.return_items
  FOR SELECT USING (
    return_id IN (
      SELECT r.id
      FROM public.returns r
      JOIN public.orders o ON o.id = r.order_id
      WHERE o.user_id = get_current_user_id()
    )
  );

-- 明細を追加できるのは、自分の requested の申請に、その申請と同じ注文の明細を指す場合だけ
CREATE POLICY "return_items: insert own requested" ON public.return_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.returns r
      JOIN public.orders o ON o.id = r.order_id
      JOIN public.order_items oi ON oi.order_id = r.order_id
      WHERE r.id = return_id
        AND r.status = 'requested'
        AND o.user_id = get_current_user_id()
        AND oi.id = order_item_id
    )
  );
