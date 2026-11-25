CREATE OR REPLACE FUNCTION public.create_invoice_settlement_with_limit_check (
  p_user_id          uuid,
  p_period_start     timestamp with time zone,
  p_period_end       timestamp with time zone,
  p_monthly_limit    bigint,
  p_invoice_item_ids uuid[],
  p_invoice_amount   bigint,
  p_within_limit     jsonb,
  p_limit_exceeded   jsonb,
  p_status_change    jsonb
)
  RETURNS text
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_order_id uuid := (p_within_limit->'order'->>'id')::uuid;
  v_order_user_id uuid;
  v_confirmed bigint;
  v_status text;
  v_order jsonb;
BEGIN
  -- NULL のままだと下の上限の比較が NULL になり、上限内（invoice_sent）の側に進んでしまう
  IF p_invoice_amount IS NULL THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: invoice_amount_required' USING ERRCODE = 'P0001';
  END IF;

  -- 2つの候補は、同じ注文の同じ版から組み立てたもの（違えば、上限の確認の結果で別の注文を保存してしまう）
  IF v_order_id IS NULL
     OR (p_limit_exceeded->'order'->>'id')::uuid IS DISTINCT FROM v_order_id
     OR (p_limit_exceeded->'order'->>'version') IS DISTINCT FROM (p_within_limit->'order'->>'version') THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: candidates_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- 同一顧客の注文確定・請求作成を直列化する行ロック（place_order_with_limit_check と同じ行）。
  -- 行が無いとロックせずに進んでしまうため、無ければ失敗する
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: user_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- 請求は既存の注文にだけ作る（save_order は無い注文を新しく作るため、ここで止める）。
  SELECT user_id INTO v_order_user_id FROM public.orders WHERE id = v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: order_not_found' USING ERRCODE = 'P0001';
  END IF;
  -- 注文の会員（DB・渡された2つの注文）が p_user_id でなければ、ロックした行と集計する会員が
  -- 注文と食い違う。save_order は渡された user_id で注文を書き換えるため、渡す側も確かめる
  IF v_order_user_id <> p_user_id
     OR (p_within_limit->'order'->>'user_id')::uuid IS DISTINCT FROM p_user_id
     OR (p_limit_exceeded->'order'->>'user_id')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'invoice_settlement_invalid: user_mismatch' USING ERRCODE = 'P0001';
  END IF;

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
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."create_invoice_settlement_with_limit_check"(uuid, timestamp WITH time zone, timestamp WITH time zone, bigint, uuid[], bigint, jsonb, jsonb, jsonb)
  TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."create_invoice_settlement_with_limit_check"(uuid, timestamp with time zone, timestamp
  with time zone, bigint, uuid[], bigint, jsonb, jsonb, jsonb) IS '請求作成: ユーザー行の行ロックの中で月次上限を確かめ、呼び出し側が組み立てた上限内・上限超過の
  注文のどちらかを save_order で保存し、保存した請求の状態（invoice_sent / limit_exceeded）を返す
  （issue #393・#763）。請求できるかの判定と orders.status のロールアップは Order が行う。
  service role（管理者クライアント）からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL
  ON FUNCTION "public"."create_invoice_settlement_with_limit_check"(uuid, timestamp WITH time zone, timestamp WITH time zone, bigint, uuid[], bigint, jsonb, jsonb, jsonb)
  FROM PUBLIC;
