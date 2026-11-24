-- ============================================================
-- 請求作成の業務ルールを DB 関数から Order に移す（issue #763）
--
-- これまでの create_invoice_settlement_with_limit_check（#393・#721）は、請求できるかの判定
-- （後払い・未請求・価格が決まっている・キャンセル済みでない・同じ注文の明細）と、上限を超えたときの
-- orders.status のロールアップ（Order.rollupStatus() と同じ判断）を SQL の中に持っていた。
-- 業務ルールの正は domain に置くため（docs/ai-prompts/architecture.md）、注文確定
-- （place_order_with_limit_check）と同じく、注文の中身は Order.draftInvoiceSettlement() が決め、
-- DB 関数は「ユーザー行の行ロック → 上限の確認 → 版を確かめた保存」だけを行う。
--
-- 上限を超えたかは、行ロックの中で他の注文の確定額を数えないと決められない。そのため呼び出し側は
-- 上限内（請求が invoice_sent）と上限超過（請求が limit_exceeded・注文も limit_exceeded）の両方の
-- 注文を組み立てて渡し、この関数が上限の確認の結果でどちらか一方を save_order で保存する。
-- save_order が版を確かめるため、組み立てた後に注文が変わっていれば何も保存せずに失敗する
-- （同じ明細の請求作成を同時に実行したときも、後の方はここで失敗する）
-- ============================================================

DROP FUNCTION public.create_invoice_settlement_with_limit_check(
  uuid, uuid[], uuid, timestamptz, timestamptz, bigint, uuid
);

CREATE FUNCTION public.create_invoice_settlement_with_limit_check(
  p_user_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  -- NULL = 無制限（上限の判定をしない）
  p_monthly_limit bigint,
  -- 請求に紐付ける明細と請求額。明細は未請求のまま確定額に入っているため、除いて数えてから請求額を足す
  p_invoice_item_ids uuid[],
  p_invoice_amount bigint,
  -- 上限内・上限超過のときに保存する注文: { order, settlements, items }（save_order の引数と同じ形）
  p_within_limit jsonb,
  p_limit_exceeded jsonb,
  -- orders.status が変わったときに履歴に残す主体（save_order の p_status_change）
  p_status_change jsonb
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_confirmed bigint;
  v_status text;
  v_order jsonb;
BEGIN
  -- 同一顧客の注文確定・請求作成を直列化する行ロック（place_order_with_limit_check と同じ行）
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  v_confirmed := public.confirmed_amount_in_period(
    p_user_id, p_period_start, p_period_end, p_invoice_item_ids
  );

  -- 上限が NULL（無制限）のときだけ判定しない。上限0は上限0として扱う
  IF p_monthly_limit IS NOT NULL AND v_confirmed + p_invoice_amount > p_monthly_limit THEN
    v_status := 'limit_exceeded';
    v_order := p_limit_exceeded;
  ELSE
    v_status := 'invoice_sent';
    v_order := p_within_limit;
  END IF;

  -- 版の確認・版の更新・状態が変わったときの履歴は save_order が行う（issue #721）
  PERFORM public.save_order(
    v_order->'order', v_order->'settlements', v_order->'items', p_status_change
  );

  RETURN v_status;
END;
$$;

COMMENT ON FUNCTION public.create_invoice_settlement_with_limit_check IS
  '請求作成: ユーザー行の行ロックの中で月次上限を確かめ、呼び出し側が組み立てた上限内・上限超過の
  注文のどちらかを save_order で保存し、保存した請求の状態（invoice_sent / limit_exceeded）を返す
  （issue #393・#763）。請求できるかの判定と orders.status のロールアップは Order が行う。
  service role（管理者クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.create_invoice_settlement_with_limit_check FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice_settlement_with_limit_check FROM anon, authenticated;

COMMENT ON COLUMN public.orders.version IS
  '注文の集約（注文・明細の settlement_id・決済単位）の版（楽観ロック。issue #721）。save_order が書き換えるたびに1つ進める（請求作成も save_order で保存する。issue #763）。save_order は、呼び出し側が読んだ時点の版と違えば失敗する。';
