CREATE OR REPLACE FUNCTION public.get_current_admin_user_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $function$
  SELECT id
  FROM public.admin_users
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_current_admin_user_id"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."get_current_admin_user_id"() FROM PUBLIC;
