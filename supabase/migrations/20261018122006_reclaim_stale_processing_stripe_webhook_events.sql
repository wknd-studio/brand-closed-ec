-- ============================================================
-- claim_stripe_webhook_event: 古いprocessingの行も再クレームできるようにする
-- GitHub issue #409
--
-- 処理中にWorkerのタイムアウト・CPU上限などで落ちると、markFailedが呼ばれず
-- `status='processing'` のまま行が残り、Stripeの再送が永久にスキップされていた。
-- received_at（クレームした時刻）から10分たったprocessingの行は、処理が
-- 途中で落ちたものとみなして再クレームを許す。
--
-- 10分の根拠: Webhookの処理はStripeの応答待ちタイムアウト（数十秒）と
-- WorkersのCPU時間上限（既定30秒）の内に終わる前提で、10分はそれを大きく
-- 上回る。一方、Stripeの自動再送は指数バックオフで数分〜数時間おきのため、
-- 10分あれば次回以降の再送で確実に回復できる。
--
-- 同時に2件の再送が来ても、ON CONFLICT DO UPDATEのWHEREは行ロック取得後に
-- 再評価されるため、先に再クレームした側がreceived_atをNOW()に更新し、
-- 後続はprocessing（10分以内）と判定されてfalseになる。
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_type text,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
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
$$;

COMMENT ON FUNCTION public.claim_stripe_webhook_event IS
  'Stripe Webhookイベントのクレーム（先着1件のみ受理）。新規・前回失敗（failed）・
  processingのまま10分以上たった（処理が途中で落ちた）イベントであればtrueを返して
  status=processingに確保し、処理中（10分以内）/処理済みならfalseを返す。
  service role（Webhookハンドラー）のみが呼び出す想定のため、他ロールへのEXECUTE権限は
  付与しない。';

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event FROM anon, authenticated;
