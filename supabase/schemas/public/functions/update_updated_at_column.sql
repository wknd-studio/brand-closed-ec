CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
