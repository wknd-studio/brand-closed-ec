CREATE OR REPLACE FUNCTION public.confirm_subscription_onboarding (
  p_user_id                uuid,
  p_rank_code              text,
  p_stripe_customer_id     text,
  p_stripe_subscription_id text,
  p_status                 text,
  p_current_period_start   timestamp with time zone,
  p_current_period_end     timestamp with time zone,
  p_billing_anchor_day     integer
)
  RETURNS text
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_onboarding_completed boolean;
  v_subscription_user_id uuid;
BEGIN
  -- 同じ会員への同時の再送を直列化する。後から来た側は、先の確定がコミット
  -- されたあとに下の存在チェックで subscriptions 行を見つけて何もせずに終わる
  SELECT onboarding_completed INTO v_onboarding_completed
  FROM public.users
  WHERE id = p_user_id AND deleted_at IS NULL
  FOR UPDATE;

  -- 読み取りのあとに退会した等。再送しても成功しないため、例外にせず呼び出し側で
  -- 運営者に知らせる
  IF NOT FOUND THEN
    RETURN 'member_not_found';
  END IF;

  -- stripe_subscription_id は一意のため、会員を問わずに探す
  SELECT user_id INTO v_subscription_user_id
  FROM public.subscriptions
  WHERE stripe_subscription_id = p_stripe_subscription_id;

  IF FOUND THEN
    -- Webhookの再配信: 同じ会員・同じSubscriptionで確定済みなら何もしない
    -- （rank_changesを2行にしない・billing_anchor_dayを書き換えない）。途中で
    -- 失敗した場合は何も残っていないため、再送で最初から確定し直せる
    IF v_subscription_user_id = p_user_id THEN
      RETURN 'already_confirmed';
    END IF;
    -- 別の会員で記録済みのSubscription: INSERTすると一意制約違反になるため、
    -- 呼び出し側で運営者に知らせる
    RETURN 'conflicting_subscription';
  END IF;

  -- 入会済み、または別のSubscriptionの行がある会員: 二重契約は自動で記録・上書きせず、
  -- 呼び出し側で運営者に知らせる
  IF v_onboarding_completed OR EXISTS (
    SELECT 1 FROM public.subscriptions WHERE user_id = p_user_id
  ) THEN
    RETURN 'conflicting_subscription';
  END IF;

  UPDATE public.users
  SET
    stripe_customer_id = p_stripe_customer_id,
    billing_anchor_day = p_billing_anchor_day,
    onboarding_completed = true
  WHERE id = p_user_id;

  INSERT INTO public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, status, rank_code,
    current_period_start, current_period_end
  ) VALUES (
    p_user_id, p_stripe_customer_id, p_stripe_subscription_id, p_status, p_rank_code,
    p_current_period_start, p_current_period_end
  );

  -- 入会時のCheckoutは月額と初期費用の両方を請求する（src/app/onboarding/payment/page.tsx）
  PERFORM public.apply_rank_change(
    p_user_id, NULL, p_rank_code, 'member', true, p_stripe_subscription_id
  );

  RETURN 'confirmed';
END;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."confirm_subscription_onboarding"(uuid, text, text, text, text, timestamp WITH time zone, timestamp WITH time zone, integer)
  TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."confirm_subscription_onboarding"(uuid, text, text, text, text, timestamp with time zone, timestamp
  with time zone, integer) IS '初回入会の確定（usersの入会時の項目・subscriptionsの作成・apply_rank_changeによる
  ランク変更の記録）を1トランザクションで行い、結果を返す。
  confirmed: 確定した / already_confirmed: 同じ会員・同じstripe_subscription_idで
  確定済みのため何もしない（Webhook再配信の冪等性） / conflicting_subscription: 入会済み、
  または別のSubscriptionの行がある会員、または同じstripe_subscription_idが別の会員で
  記録済みのため何もしない / member_not_found: 有効な会員（退会済みでないusers行）が
  無いため何もしない。conflicting_subscription・member_not_foundは決済済みのため、
  呼び出し側で運営者に知らせる。
  service role（Stripe Webhookハンドラー）からのみ呼び出す想定のため、他ロールへの
  EXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION "public"."confirm_subscription_onboarding"(uuid, text, text, text, text, timestamp WITH time zone, timestamp WITH time zone, integer) FROM PUBLIC;
