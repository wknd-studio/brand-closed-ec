-- ============================================================
-- 注文（+明細+決済単位）の削除を1回のDB呼び出しにまとめる
-- GitHub issue #606
--
-- 注文確定でCheckoutの作成に失敗したときの補償削除（placeOrder）は、
-- これまで supabase-js で明細 → 決済単位 → 注文を3回に分けて消していた。
-- PostgREST は1リクエスト＝1トランザクションのため、途中で失敗すると明細0件の
-- 注文と決済単位が残り、Order.of の不変条件で以降の読み込みが失敗していた。
-- この関数の中で消すことで、途中で失敗しても全体がロールバックされる。
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- order_items.settlement_id → order_settlements の外部キーがあるため、明細を先に消す
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.order_settlements WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION public.delete_order IS
  '注文と、その明細・決済単位を1つのトランザクションで削除する（issue #606）。
  service role（管理者クライアント）からのみ呼び出す想定のため、他ロールへの
  EXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.delete_order FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order FROM anon, authenticated;
