CREATE OR REPLACE FUNCTION public.confirmed_amount_in_period (
  p_user_id           uuid,
  p_period_start      timestamp with time zone,
  p_period_end        timestamp with time zone,
  p_excluded_item_ids uuid[]                   DEFAULT '{}'::uuid[]
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  AS $function$
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
    -- NULL・NULL を含む配列を渡されても、除外なしとして数える（<> ALL が NULL になり0円にならないように）
    AND oi.id <> ALL (array_remove(COALESCE(p_excluded_item_ids, '{}'), NULL));
$function$;

GRANT EXECUTE ON FUNCTION "public"."confirmed_amount_in_period"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid[]) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."confirmed_amount_in_period"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid[]) FROM PUBLIC;
