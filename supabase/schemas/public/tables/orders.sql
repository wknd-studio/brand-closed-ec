CREATE TABLE "public"."orders" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                   uuid                     NOT NULL,
  "status"                    text                     NOT NULL DEFAULT 'processing'::text,
  "shipping_address_snapshot" jsonb                    NOT NULL,
  "billing_address_snapshot"  jsonb                    NOT NULL,
  "monthly_limit_at_order"    bigint,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "version"                   bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['cancelled'::text, 'processing'::text, 'limit_exceeded'::text, 'paid'::text]))),
  CONSTRAINT "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."orders"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."orders"
  ADD COLUMN "rank_at_order" public.member_rank NOT NULL;

CREATE INDEX orders_status_idx ON public.orders USING btree (status);

CREATE INDEX orders_user_id_idx ON public.orders USING btree (user_id);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "orders: select own" ON "public"."orders"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."orders"."monthly_limit_at_order" IS '注文時点の月間仕入れ上限（円）のスナップショット。NULL = 無制限（member_ranks.monthly_limit_amount と同じ表し方）。';

COMMENT ON COLUMN "public"."orders"."status" IS '表示用のロールアップ値。配下のorder_settlements・order_itemsから都度算出して
  書き戻す（正のデータではない）。直接書き込むのはcancelled（決済単位が1件も
  作られる前のキャンセル）のみ。';

COMMENT ON COLUMN "public"."orders"."version" IS '注文の集約（注文・明細の settlement_id・決済単位）の版（楽観ロック。issue #721）。save_order・create_invoice_settlement_with_limit_check が書き換えるたびに1つ進める。save_order は、呼び出し側が読んだ時点の版と違えば失敗する。';
