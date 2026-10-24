-- ============================================================
-- 入会確定関数が、確定した・確定済みだった・入会済みの会員に別のサブスクリプションが
-- 届いた、のどれだったかを返すようにする
-- GitHub issue #413
--
-- これまで、入会済みの会員に別のサブスクリプション（記録済みと異なる
-- stripe_subscription_id）の確定が届くと、有効な行があれば
-- subscriptions_user_active_idx の一意制約違反で失敗し、Webhookが500を返して
-- Stripeが再送を続けていた。有効な行が無ければ（解約済み等）、入会済みの会員に
-- もう一度入会時のランク変更を記録していた。
-- 入会済みの会員への別のサブスクリプションは課金済みのため、自動で記録・上書きは
-- せず、呼び出し側（Webhookハンドラー）が運営者に知らせて手動で返金・解約する。
--
-- 戻り値を変えるため、CREATE OR REPLACE ではなく作り直す
-- ============================================================

DROP FUNCTION public.confirm_subscription_onboarding(
  uuid, text, text, text, text, timestamptz, timestamptz, integer
);

CREATE FUNCTION public.confirm_subscription_onboarding(
  p_user_id uuid,
  p_rank_code text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_billing_anchor_day integer
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_onboarding_completed boolean;
BEGIN
  -- 同じ会員への同時の再送を直列化する。後から来た側は、先の確定がコミット
  -- されたあとに下の存在チェックで subscriptions 行を見つけて何もせずに終わる
  SELECT onboarding_completed INTO v_onboarding_completed
  FROM public.users
  WHERE id = p_user_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_user_not_found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Webhookの再配信: 同じSubscriptionで確定済みなら何もしない（rank_changesを
  -- 2行にしない・billing_anchor_dayを書き換えない）。途中で失敗した場合は
  -- 何も残っていないため、再送で最初から確定し直せる
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE stripe_subscription_id = p_stripe_subscription_id
      AND user_id = p_user_id
  ) THEN
    RETURN 'already_confirmed';
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
$$;

COMMENT ON FUNCTION public.confirm_subscription_onboarding IS
  '初回入会の確定（usersの入会時の項目・subscriptionsの作成・apply_rank_changeによる
  ランク変更の記録）を1トランザクションで行い、結果を返す。
  confirmed: 確定した / already_confirmed: 同じstripe_subscription_idで確定済みのため
  何もしない（Webhook再配信の冪等性） / conflicting_subscription: 入会済み、または別の
  Subscriptionの行がある会員のため何もしない（呼び出し側で運営者に知らせる）。
  service role（Stripe Webhookハンドラー）からのみ呼び出す想定のため、他ロールへの
  EXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.confirm_subscription_onboarding FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_subscription_onboarding FROM anon, authenticated;
