CREATE TABLE "public"."cart_items" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "sanity_product_id" text                     NOT NULL,
  "quantity"          integer                  NOT NULL DEFAULT 1,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cart_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "cart_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "cart_items_user_id_sanity_product_id_key" UNIQUE (user_id, sanity_product_id),
  CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."cart_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX cart_items_user_id_idx ON public.cart_items USING btree (user_id);

CREATE TRIGGER cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "cart_items: delete own" ON "public"."cart_items"
  FOR DELETE
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

CREATE POLICY "cart_items: insert own" ON "public"."cart_items"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((user_id = public.get_current_user_id()));

CREATE POLICY "cart_items: select own" ON "public"."cart_items"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

CREATE POLICY "cart_items: update own" ON "public"."cart_items"
  FOR UPDATE
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cart_items" TO "anon", "authenticated", "postgres", "service_role";
