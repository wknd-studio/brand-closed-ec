CREATE TABLE "public"."locations" (
  "code"               text                     NOT NULL,
  "name"               text                     NOT NULL,
  "requires_receiving" boolean                  NOT NULL,
  "postal_code"        text,
  "prefecture"         text,
  "city"               text,
  "address_line1"      text,
  "address_line2"      text,
  "phone_number"       text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "locations_pkey" PRIMARY KEY (code)
);

ALTER TABLE "public"."locations"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."locations" TO "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."locations"."postal_code" IS '住所・電話番号は office 行のみ想定。リポジトリに実際の住所を書かないため、マイグレーションではNULLのまま入れ、環境ごとにSQLで設定する。';

COMMENT ON COLUMN "public"."locations"."requires_receiving" IS 'この拠点経由の明細は、出荷前に事務所での入荷検品（order_items.received_at）を必須とするか。';

COMMENT ON TABLE "public"."locations" IS '商品が出発する配送「元」のマスタ（issue #354）。顧客が指定する配送「先」の addresses とは別物で、参照もしない。';
