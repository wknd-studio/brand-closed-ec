CREATE TABLE "public"."addresses" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              uuid                     NOT NULL,
  "type"                 text                     NOT NULL,
  "is_default"           boolean                  NOT NULL DEFAULT false,
  "recipient_last_name"  text                     NOT NULL,
  "recipient_first_name" text                     NOT NULL,
  "postal_code"          text                     NOT NULL,
  "prefecture"           text                     NOT NULL,
  "city"                 text                     NOT NULL,
  "address_line1"        text                     NOT NULL,
  "address_line2"        text,
  "phone_number"         text                     NOT NULL,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "addresses_pkey" PRIMARY KEY (id),
  CONSTRAINT "addresses_type_check" CHECK ((type = ANY (ARRAY['billing'::text, 'shipping'::text, 'headquarters'::text]))),
  CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."addresses"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX addresses_user_id_idx ON public.addresses USING btree (user_id);

CREATE TRIGGER addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "addresses: delete own" ON "public"."addresses"
  FOR DELETE
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

CREATE POLICY "addresses: insert own" ON "public"."addresses"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((user_id = public.get_current_user_id()));

CREATE POLICY "addresses: select own" ON "public"."addresses"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

CREATE POLICY "addresses: update own" ON "public"."addresses"
  FOR UPDATE
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."addresses" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."addresses"."type" IS '配送先・請求先・本店所在地の区別。旧address_type ENUM列を置き換え
  （TEXT+CHECK）。headquarters追加によりorganizationsの住所カラムを
  このテーブルに統合できるようにした。';
