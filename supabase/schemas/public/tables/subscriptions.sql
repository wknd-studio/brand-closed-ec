CREATE TABLE "public"."subscriptions" (
  "id"                              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                         uuid                     NOT NULL,
  "stripe_customer_id"              text                     NOT NULL,
  "stripe_subscription_id"          text                     NOT NULL,
  "stripe_subscription_schedule_id" text,
  "status"                          text                     NOT NULL,
  "rank_code"                       text                     NOT NULL,
  "pending_rank_code"               text,
  "current_period_start"            timestamp with time zone NOT NULL,
  "current_period_end"              timestamp with time zone NOT NULL,
  "cancel_at_period_end"            boolean                  NOT NULL DEFAULT false,
  "canceled_at"                     timestamp with time zone,
  "created_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "subscriptions_pending_rank_code_fkey" FOREIGN KEY (pending_rank_code) REFERENCES public.member_ranks(code),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscriptions_rank_code_fkey" FOREIGN KEY (rank_code) REFERENCES public.member_ranks(code),
  CONSTRAINT "subscriptions_status_check"
    CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'unpaid'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text]))),
  CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE (stripe_subscription_id),
  CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX subscriptions_user_active_idx ON public.subscriptions USING btree (user_id)
  WHERE (status <> ALL (ARRAY['canceled'::text, 'incomplete_expired'::text]));

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions USING btree (user_id);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "subscriptions: select own" ON "public"."subscriptions"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subscriptions" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."subscriptions" IS 'Stripe Subscriptionオブジェクトの現在値ミラー。user_id/organization_idは排他（どちらか一方のみ非NULL）。来歴はrank_changesが別途持つ。';
