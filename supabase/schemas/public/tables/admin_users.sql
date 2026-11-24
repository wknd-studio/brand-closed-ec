CREATE TABLE "public"."admin_users" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id" text                     NOT NULL,
  "name"          text                     NOT NULL,
  "email"         text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_users_clerk_user_id_key" UNIQUE (clerk_user_id),
  CONSTRAINT "admin_users_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."admin_users"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_users: select own" ON "public"."admin_users"
  FOR SELECT
  TO PUBLIC
  USING ((id = public.get_current_admin_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_users" TO "anon", "authenticated", "postgres", "service_role";
