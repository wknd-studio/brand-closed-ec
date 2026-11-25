CREATE TABLE "public"."shipments" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"               uuid                     NOT NULL,
  "status"                 text                     NOT NULL DEFAULT 'pending'::text,
  "assigned_admin_user_id" uuid,
  "carrier"                text,
  "tracking_number"        text,
  "shipped_at"             timestamp with time zone,
  "delivered_at"           timestamp with time zone,
  "origin_location_code"   text                     NOT NULL,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shipments_assigned_admin_user_id_fkey" FOREIGN KEY (assigned_admin_user_id) REFERENCES public.admin_users(id),
  CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT "shipments_origin_location_code_fkey" FOREIGN KEY (origin_location_code) REFERENCES public.locations(code),
  CONSTRAINT "shipments_pkey" PRIMARY KEY (id),
  CONSTRAINT "shipments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'preparing'::text, 'shipped'::text, 'delivered'::text])))
);

ALTER TABLE "public"."shipments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX shipments_order_id_idx ON public.shipments USING btree (order_id);

CREATE POLICY "shipments: select own" ON "public"."shipments"
  FOR SELECT
  TO PUBLIC
  USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.user_id = public.get_current_user_id()))));

GRANT SELECT ("carrier") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("created_at") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("delivered_at") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("id") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("order_id") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("origin_location_code") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("shipped_at") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("status") ON TABLE "public"."shipments" TO "authenticated";

GRANT SELECT ("tracking_number") ON TABLE "public"."shipments" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shipments" TO "postgres", "service_role";
