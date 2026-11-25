CREATE TABLE "public"."admin_memberships" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "admin_user_id" uuid                     NOT NULL,
  "clerk_role"    text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_memberships_admin_user_id_key" UNIQUE (admin_user_id),
  CONSTRAINT "admin_memberships_pkey" PRIMARY KEY (id),
  CONSTRAINT "admin_memberships_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id)
);

ALTER TABLE "public"."admin_memberships"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER admin_memberships_updated_at
  BEFORE UPDATE ON public.admin_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "admin_memberships: select own" ON "public"."admin_memberships"
  FOR SELECT
  TO PUBLIC
  USING ((admin_user_id = public.get_current_admin_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_memberships" TO "authenticated", "postgres", "service_role";
