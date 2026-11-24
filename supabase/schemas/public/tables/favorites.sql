CREATE TABLE "public"."favorites" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "sanity_product_id" text                     NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "favorites_pkey" PRIMARY KEY (id),
  CONSTRAINT "favorites_user_id_sanity_product_id_key" UNIQUE (user_id, sanity_product_id),
  CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."favorites"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX favorites_user_id_idx ON public.favorites USING btree (user_id);

CREATE POLICY "favorites: delete own" ON "public"."favorites"
  FOR DELETE
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

CREATE POLICY "favorites: insert own" ON "public"."favorites"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((user_id = public.get_current_user_id()));

CREATE POLICY "favorites: select own" ON "public"."favorites"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."favorites" TO "anon", "authenticated", "postgres", "service_role";
