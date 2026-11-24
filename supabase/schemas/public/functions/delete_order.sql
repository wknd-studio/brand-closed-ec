CREATE OR REPLACE FUNCTION public.delete_order (
  p_order_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  -- order_items.settlement_id → order_settlements の外部キーがあるため、明細を先に消す
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.order_settlements WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."delete_order"(uuid) TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."delete_order"(uuid) IS '注文と、その明細・決済単位を1つのトランザクションで削除する（issue #606）。
  service role（管理者クライアント）からのみ呼び出す想定のため、他ロールへの
  EXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION "public"."delete_order"(uuid) FROM PUBLIC;
