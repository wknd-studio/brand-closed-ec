CREATE TABLE "public"."order_settlements" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"                   uuid                     NOT NULL,
  "flow"                       text                     NOT NULL,
  "status"                     text                     NOT NULL,
  "stripe_checkout_session_id" text,
  "stripe_invoice_id"          text,
  "amount_snapshot"            bigint                   NOT NULL,
  "paid_at"                    timestamp with time zone,
  "cancelled_at"               timestamp with time zone,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_settlements_flow_check" CHECK ((flow = ANY (ARRAY['checkout'::text, 'invoice'::text]))),
  CONSTRAINT "order_settlements_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_settlements_status_check"
    CHECK ((status = ANY (ARRAY['pending_payment'::text, 'invoice_sent'::text, 'limit_exceeded'::text, 'paid'::text, 'cancelled'::text]))),
  CONSTRAINT "order_settlements_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id)
);

ALTER TABLE "public"."order_settlements"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX order_settlements_order_id_idx ON public.order_settlements USING btree (order_id);

CREATE UNIQUE INDEX order_settlements_stripe_checkout_session_id_key ON public.order_settlements USING btree (stripe_checkout_session_id)
  WHERE (stripe_checkout_session_id IS NOT NULL);

CREATE UNIQUE INDEX order_settlements_stripe_invoice_id_key ON public.order_settlements USING btree (stripe_invoice_id)
  WHERE (stripe_invoice_id IS NOT NULL);

CREATE TRIGGER order_settlements_updated_at
  BEFORE UPDATE ON public.order_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "order_settlements: select own" ON "public"."order_settlements"
  FOR SELECT
  TO PUBLIC
  USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.user_id = public.get_current_user_id()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_settlements" TO "anon", "authenticated", "postgres", "service_role";
