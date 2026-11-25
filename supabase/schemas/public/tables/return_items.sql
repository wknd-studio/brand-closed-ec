CREATE TABLE "public"."return_items" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "return_id"     uuid                     NOT NULL,
  "order_item_id" uuid                     NOT NULL,
  "quantity"      integer                  NOT NULL,
  "refund_amount" bigint,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES public.order_items(id),
  CONSTRAINT "return_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "return_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "return_items_refund_amount_check" CHECK ((refund_amount >= 0)),
  CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY (return_id) REFERENCES public.returns(id) ON DELETE CASCADE
);

ALTER TABLE "public"."return_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX return_items_order_item_id_idx ON public.return_items USING btree (order_item_id);

CREATE INDEX return_items_return_id_idx ON public.return_items USING btree (return_id);

CREATE POLICY "return_items: insert own requested" ON "public"."return_items"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.returns r
     JOIN public.orders o ON ((o.id = r.order_id)))
     JOIN public.order_items oi ON ((oi.order_id = r.order_id)))
  WHERE ((r.id = return_items.return_id) AND (r.status = 'requested'::text) AND (o.user_id = public.get_current_user_id()) AND (oi.id = return_items.order_item_id)))));

CREATE POLICY "return_items: select own" ON "public"."return_items"
  FOR SELECT
  TO PUBLIC
  USING ((return_id IN ( SELECT r.id
   FROM (public.returns r
     JOIN public.orders o ON ((o.id = r.order_id)))
  WHERE (o.user_id = public.get_current_user_id()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."return_items" TO "postgres", "service_role";

REVOKE ALL ("created_at") ON TABLE "public"."return_items" FROM "authenticated";

GRANT SELECT ("created_at") ON TABLE "public"."return_items" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."return_items" FROM "authenticated";

GRANT INSERT ("id"), SELECT ("id") ON TABLE "public"."return_items" TO "authenticated";

REVOKE ALL ("order_item_id") ON TABLE "public"."return_items" FROM "authenticated";

GRANT INSERT ("order_item_id"), SELECT ("order_item_id") ON TABLE "public"."return_items" TO "authenticated";

REVOKE ALL ("quantity") ON TABLE "public"."return_items" FROM "authenticated";

GRANT INSERT ("quantity"), SELECT ("quantity") ON TABLE "public"."return_items" TO "authenticated";

REVOKE ALL ("refund_amount") ON TABLE "public"."return_items" FROM "authenticated";

GRANT SELECT ("refund_amount") ON TABLE "public"."return_items" TO "authenticated";

REVOKE ALL ("return_id") ON TABLE "public"."return_items" FROM "authenticated";

GRANT INSERT ("return_id"), SELECT ("return_id") ON TABLE "public"."return_items" TO "authenticated";
