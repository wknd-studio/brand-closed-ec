CREATE TABLE "public"."stripe_webhook_events" (
  "event_id"     text                     NOT NULL,
  "type"         text                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'processing'::text,
  "payload"      jsonb                    NOT NULL,
  "error"        text,
  "received_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY (event_id),
  CONSTRAINT "stripe_webhook_events_status_check" CHECK ((status = ANY (ARRAY['processing'::text, 'processed'::text, 'failed'::text])))
);

ALTER TABLE "public"."stripe_webhook_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX stripe_webhook_events_status_idx ON public.stripe_webhook_events USING btree (status);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."stripe_webhook_events" TO "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."stripe_webhook_events" IS 'Stripe Webhookイベントの冪等性テーブル。処理パターン: INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id。行が返らなければ処理済み/処理中と判定してスキップする。';
