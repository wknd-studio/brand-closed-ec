CREATE TABLE "public"."member_ranks" (
  "code"                        text                     NOT NULL,
  "sort_order"                  smallint                 NOT NULL,
  "display_name_ja"             text                     NOT NULL,
  "monthly_limit_amount"        bigint,
  "stripe_monthly_price_id"     text,
  "stripe_initial_fee_price_id" text,
  "is_active"                   boolean                  NOT NULL DEFAULT true,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_ranks_pkey" PRIMARY KEY (code),
  CONSTRAINT "member_ranks_sort_order_key" UNIQUE (sort_order)
);

ALTER TABLE "public"."member_ranks"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER member_ranks_updated_at
  BEFORE UPDATE ON public.member_ranks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "member_ranks_select_all" ON "public"."member_ranks"
  FOR SELECT
  TO PUBLIC
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_ranks" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."member_ranks"."monthly_limit_amount" IS '月間仕入れ上限（円）。NULL = 無制限（enterprise想定）。';

COMMENT ON TABLE "public"."member_ranks" IS '会員ランクのマスタ。旧member_rank ENUMの置き換え。金額そのものの正はStripeダッシュボード（Price）であり、monthly_limit_amountのような業務ロジック固有の値のみここを正とする。';
