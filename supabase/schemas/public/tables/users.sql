CREATE TABLE "public"."users" (
  "id"                          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "clerk_user_id"               text                     NOT NULL,
  "stripe_customer_id"          text,
  "email"                       text                     NOT NULL,
  "first_name"                  text                     NOT NULL DEFAULT ''::text,
  "last_name"                   text                     NOT NULL DEFAULT ''::text,
  "rank_code"                   text                     NOT NULL DEFAULT 'starter'::text,
  "onboarding_completed"        boolean                  NOT NULL DEFAULT false,
  "deleted_at"                  timestamp with time zone,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "phone_number"                text                     NOT NULL DEFAULT ''::text,
  "profile_completed_at"        timestamp with time zone,
  "billing_anchor_day"          smallint,
  "initial_fee_paid_rank_code"  text,
  "member_type"                 text                     NOT NULL DEFAULT 'individual'::text,
  "company_name"                text,
  "invoice_registration_number" text,
  CONSTRAINT "users_billing_anchor_day_check" CHECK (((billing_anchor_day IS NULL) OR ((billing_anchor_day >= 1) AND (billing_anchor_day <= 28)))),
  CONSTRAINT "users_corporate_requires_company_name" CHECK (((member_type <> 'corporate'::text) OR (company_name IS NOT NULL))),
  CONSTRAINT "users_corporate_requires_invoice_registration_number" CHECK (((member_type <> 'corporate'::text) OR (invoice_registration_number IS NOT NULL))),
  CONSTRAINT "users_initial_fee_paid_rank_code_fkey" FOREIGN KEY (initial_fee_paid_rank_code) REFERENCES public.member_ranks(code),
  CONSTRAINT "users_invoice_registration_number_check" CHECK (((invoice_registration_number IS NULL) OR (invoice_registration_number ~ '^T\d{13}$'::text))),
  CONSTRAINT "users_member_type_check" CHECK ((member_type = ANY (ARRAY['individual'::text, 'corporate'::text]))),
  CONSTRAINT "users_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_rank_code_fkey" FOREIGN KEY (rank_code) REFERENCES public.member_ranks(code)
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX users_clerk_user_id_active_idx ON public.users USING btree (clerk_user_id)
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX users_stripe_customer_id_active_idx ON public.users USING btree (stripe_customer_id)
  WHERE (deleted_at IS NULL);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "users: select own" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING ((id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."users"."initial_fee_paid_rank_code" IS 'これまでに初期費用を支払った中で最も高いランク。アップグレード時の初期費用二重課金判定に使うキャッシュ。';

COMMENT ON COLUMN "public"."users"."rank_code" IS '現在の会員ランク（非正規化キャッシュ）。更新は必ずrank_changesへのINSERTと同一トランザクションで行う。旧member_rank ENUM列（rank）を置き換え。';
