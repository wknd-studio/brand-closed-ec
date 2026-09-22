-- ============================================================
-- stripe_webhook_events の冪等性クレーム関数
-- docs/db-schema-redesign.md「stripe_webhook_events」節、GitHub issue #221
--
-- 素朴な `INSERT ... ON CONFLICT (event_id) DO NOTHING` だと、処理が途中で
-- 例外を投げて `status='processing'` のまま残った行に対し、Stripeの再送が
-- 永久にCONFLICTで読み飛ばされてしまう（#221のissueコメントで指摘）。
-- 前回が `failed` の場合のみ `DO UPDATE` で再クレームできるようにすることで、
-- 「新規イベント」「処理中/処理済みの再送→スキップ」「失敗後の再送→再処理」の
-- 3パターンを1回のクエリで機械的に判定する。
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
    WHERE public.stripe_webhook_events.status = 'failed';

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.claim_stripe_webhook_event IS
  'Stripe Webhookイベントのクレーム（先着1件のみ受理）。新規または前回失敗（failed）の
  イベントであればtrueを返してstatus=processingに確保し、処理中/処理済みならfalseを返す。
  service role（Webhookハンドラー）のみが呼び出す想定のため、他ロールへのEXECUTE権限は
  付与しない。';

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event FROM anon, authenticated;
