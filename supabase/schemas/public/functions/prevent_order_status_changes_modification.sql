CREATE OR REPLACE FUNCTION public.prevent_order_status_changes_modification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = OLD.order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'order_status_changes は追記専用のため % できません', TG_OP
    USING ERRCODE = 'P0001';
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prevent_order_status_changes_modification"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";
