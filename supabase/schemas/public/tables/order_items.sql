CREATE TABLE "public"."order_items" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"                  uuid                     NOT NULL,
  "sanity_product_id"         text                     NOT NULL,
  "product_name_snapshot"     text                     NOT NULL,
  "unit_price_snapshot"       bigint,
  "quantity"                  integer                  NOT NULL,
  "is_negotiable"             boolean                  NOT NULL DEFAULT false,
  "negotiated_unit_price"     bigint,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "payment_timing"            text                     NOT NULL,
  "settlement_id"             uuid,
  "procurement_task_id"       uuid,
  "received_at"               timestamp with time zone,
  "fulfillment_location_code" text                     NOT NULL DEFAULT 'office'::text,
  "shipment_id"               uuid,
  CONSTRAINT "order_items_fulfillment_location_code_fkey" FOREIGN KEY (fulfillment_location_code) REFERENCES public.locations(code),
  CONSTRAINT "order_items_payment_timing_check" CHECK ((payment_timing = ANY (ARRAY['at_order'::text, 'after_order'::text]))),
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "order_items_settlement_id_fkey" FOREIGN KEY (settlement_id) REFERENCES public.order_settlements(id),
  CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT "order_items_procurement_task_id_fkey" FOREIGN KEY (procurement_task_id) REFERENCES public.procurement_tasks(id),
  CONSTRAINT "order_items_shipment_id_fkey" FOREIGN KEY (shipment_id) REFERENCES public.shipments(id)
);

ALTER TABLE "public"."order_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX order_items_fulfillment_location_code_idx ON public.order_items USING btree (fulfillment_location_code);

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);

CREATE INDEX order_items_procurement_task_id_idx ON public.order_items USING btree (procurement_task_id)
  WHERE (procurement_task_id IS NOT NULL);

CREATE INDEX order_items_settlement_id_idx ON public.order_items USING btree (settlement_id)
  WHERE (settlement_id IS NOT NULL);

CREATE INDEX order_items_shipment_id_idx ON public.order_items USING btree (shipment_id)
  WHERE (shipment_id IS NOT NULL);

CREATE POLICY "order_items: select own" ON "public"."order_items"
  FOR SELECT
  TO PUBLIC
  USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.user_id = public.get_current_user_id()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_items" TO "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."order_items"."fulfillment_location_code" IS 'この明細が事務所経由（office）か仕入れ先直送（supplier_direct）かの、注文時点のスナップショット。DEFAULT ''office'' は #357 で外す暫定。';
