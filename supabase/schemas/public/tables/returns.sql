CREATE TABLE "public"."returns" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"                  uuid                     NOT NULL,
  "status"                    text                     NOT NULL DEFAULT 'requested'::text,
  "requested_by_user_id"      uuid,
  "created_by_admin_user_id"  uuid,
  "reviewed_by_admin_user_id" uuid,
  "reason"                    text                     NOT NULL,
  "admin_note"                text,
  "stripe_refund_id"          text,
  "refund_amount"             bigint,
  "approved_at"               timestamp with time zone,
  "received_at"               timestamp with time zone,
  "refunded_at"               timestamp with time zone,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "returns_created_by_admin_user_id_fkey" FOREIGN KEY (created_by_admin_user_id) REFERENCES public.admin_users(id),
  CONSTRAINT "returns_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT "returns_pkey" PRIMARY KEY (id),
  CONSTRAINT "returns_refund_amount_check" CHECK ((refund_amount >= 0)),
  CONSTRAINT "returns_requester_check" CHECK ((num_nonnulls(requested_by_user_id, created_by_admin_user_id) = 1)),
  CONSTRAINT "returns_reviewed_by_admin_user_id_fkey" FOREIGN KEY (reviewed_by_admin_user_id) REFERENCES public.admin_users(id),
  CONSTRAINT "returns_status_check" CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'received'::text, 'refunded'::text, 'cancelled'::text]))),
  CONSTRAINT "returns_stripe_refund_id_key" UNIQUE (stripe_refund_id),
  CONSTRAINT "returns_requested_by_user_id_fkey" FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."returns"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX returns_order_id_idx ON public.returns USING btree (order_id);

CREATE INDEX returns_requested_by_user_id_idx ON public.returns USING btree (requested_by_user_id)
  WHERE (requested_by_user_id IS NOT NULL);

CREATE TRIGGER returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "returns: insert own requested" ON "public"."returns"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((status = 'requested'::text) AND (requested_by_user_id = public.get_current_user_id()) AND (order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.user_id = public.get_current_user_id())))));

CREATE POLICY "returns: select own" ON "public"."returns"
  FOR SELECT
  TO PUBLIC
  USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.user_id = public.get_current_user_id()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."returns" TO "postgres", "service_role";

REVOKE ALL ("approved_at") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("approved_at") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("created_at") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("created_at") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("id") ON TABLE "public"."returns" FROM "anon";

GRANT INSERT ("id"), SELECT ("id") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("order_id") ON TABLE "public"."returns" FROM "anon";

GRANT INSERT ("order_id"), SELECT ("order_id") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("reason") ON TABLE "public"."returns" FROM "anon";

GRANT INSERT ("reason"), SELECT ("reason") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("received_at") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("received_at") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("refund_amount") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("refund_amount") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("refunded_at") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("refunded_at") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("requested_by_user_id") ON TABLE "public"."returns" FROM "anon";

GRANT INSERT ("requested_by_user_id"), SELECT ("requested_by_user_id") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("status") ON TABLE "public"."returns" FROM "anon";

GRANT INSERT ("status"), SELECT ("status") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("stripe_refund_id") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("stripe_refund_id") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("updated_at") ON TABLE "public"."returns" FROM "anon";

GRANT SELECT ("updated_at") ON TABLE "public"."returns" TO "anon";

REVOKE ALL ("approved_at") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("approved_at") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("created_at") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("created_at") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."returns" FROM "authenticated";

GRANT INSERT ("id"), SELECT ("id") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("order_id") ON TABLE "public"."returns" FROM "authenticated";

GRANT INSERT ("order_id"), SELECT ("order_id") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("reason") ON TABLE "public"."returns" FROM "authenticated";

GRANT INSERT ("reason"), SELECT ("reason") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("received_at") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("received_at") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("refund_amount") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("refund_amount") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("refunded_at") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("refunded_at") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("requested_by_user_id") ON TABLE "public"."returns" FROM "authenticated";

GRANT INSERT ("requested_by_user_id"), SELECT ("requested_by_user_id") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("status") ON TABLE "public"."returns" FROM "authenticated";

GRANT INSERT ("status"), SELECT ("status") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("stripe_refund_id") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("stripe_refund_id") ON TABLE "public"."returns" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."returns" FROM "authenticated";

GRANT SELECT ("updated_at") ON TABLE "public"."returns" TO "authenticated";
