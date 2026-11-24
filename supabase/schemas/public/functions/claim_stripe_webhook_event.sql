CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event (
  p_event_id text,
  p_type     text,
  p_payload  jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  AS $function$
BEGIN
  INSERT INTO public.stripe_webhook_events (event_id, type, payload, status, received_at)
  VALUES (p_event_id, p_type, p_payload, 'processing', NOW())
  ON CONFLICT (event_id) DO UPDATE
    SET status = 'processing', received_at = NOW(), error = NULL
    WHERE public.stripe_webhook_events.status = 'failed'
       OR (
         public.stripe_webhook_events.status = 'processing'
         AND public.stripe_webhook_events.received_at < NOW() - INTERVAL '10 minutes'
       );

  RETURN FOUND;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_stripe_webhook_event"(text, text, jsonb) TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."claim_stripe_webhook_event"(text, text, jsonb) IS 'Stripe Webhookイベントのクレーム（先着1件のみ受理）。新規・前回失敗（failed）・
  processingのまま10分以上たった（処理が途中で落ちた）イベントであればtrueを返して
  status=processingに確保し、処理中（10分以内）/処理済みならfalseを返す。
  service role（Webhookハンドラー）のみが呼び出す想定のため、他ロールへのEXECUTE権限は
  付与しない。';

REVOKE ALL ON FUNCTION "public"."claim_stripe_webhook_event"(text, text, jsonb) FROM PUBLIC;
