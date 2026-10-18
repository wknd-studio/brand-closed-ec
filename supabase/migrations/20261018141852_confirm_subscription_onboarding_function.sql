-- ============================================================
-- 入会の確定（users・subscriptions・rank_changes）を1トランザクションで行う関数
-- GitHub issue #363
--
-- 初回入会（checkout.session.completed の mode=subscription）の処理は、これまで
-- supabase-jsで users の保存 → subscriptions の upsert を別々に行っており、
-- 次の問題があった。
-- - users.initial_fee_paid_rank_code と入会時の rank_changes を記録していなかった
-- - 「users.rank_code の更新は rank_changes への INSERT と同一トランザクションで
--   行う」（rank_changes のテーブルコメント）を満たしていなかった
-- - users の保存後に subscriptions の作成が失敗すると、再送が
--   onboarding_completed の早期returnで飛ばされ、subscriptions 行が無いまま確定した
--
-- supabase-js（PostgREST）はリクエストをまたいだトランザクションを張れないため、
-- 一連の更新をこの関数の1回の呼び出しで行う（関数全体が1トランザクションになり、
-- 途中で失敗すれば何も残らない）。
-- ============================================================

-- ------------------------------------------------------------
-- ランク変更の記録（共通関数）
-- users.rank_code・initial_fee_paid_rank_code の更新と rank_changes の INSERT を
-- 必ずセットで行う。入会確定のほか、プラン変更（#209）からも呼び出す想定。
-- initial_fee_paid_rank_code は「支払い済み最高ランク」のため、初期費用を請求した
-- 変更で、かつ新しいランクの方が高い（member_ranks.sort_order が大きい）ときだけ上げる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_rank_change(
  p_user_id uuid,
  p_from_rank_code text,
  p_to_rank_code text,
  p_changed_by text,
  p_initial_fee_charged boolean,
  p_stripe_subscription_id text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.users u
  SET
    rank_code = p_to_rank_code,
    initial_fee_paid_rank_code = CASE
      WHEN NOT p_initial_fee_charged THEN u.initial_fee_paid_rank_code
      WHEN u.initial_fee_paid_rank_code IS NULL THEN p_to_rank_code
      WHEN (SELECT sort_order FROM public.member_ranks WHERE code = p_to_rank_code)
         > (SELECT sort_order FROM public.member_ranks WHERE code = u.initial_fee_paid_rank_code)
        THEN p_to_rank_code
      ELSE u.initial_fee_paid_rank_code
    END
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.rank_changes (
    user_id, from_rank_code, to_rank_code, changed_by,
    initial_fee_charged, stripe_subscription_id
  ) VALUES (
    p_user_id, p_from_rank_code, p_to_rank_code, p_changed_by,
    p_initial_fee_charged, p_stripe_subscription_id
  );
END;
$$;

COMMENT ON FUNCTION public.apply_rank_change IS
  'users.rank_code・initial_fee_paid_rank_codeの更新とrank_changesへのINSERTを同時に行う
  （呼び出し元のトランザクション内で実行される）。initial_fee_paid_rank_codeは、初期費用を
  請求した変更で新しいランクの方が高いときだけ上げる。service roleからのみ呼び出す想定のため、
  他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.apply_rank_change FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_rank_change FROM anon, authenticated;

-- ------------------------------------------------------------
-- 入会の確定
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_subscription_onboarding(
  p_user_id uuid,
  p_rank_code text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_billing_anchor_day integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 同じ会員への同時の再送を直列化する。後から来た側は、先の確定がコミット
  -- されたあとに下の存在チェックで subscriptions 行を見つけて何もせずに終わる
  PERFORM 1 FROM public.users
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
    RETURN;
  END IF;

  UPDATE public.users
  SET
    stripe_customer_id = p_stripe_customer_id,
    billing_anchor_day = p_billing_anchor_day,
    onboarding_completed = true
  WHERE id = p_user_id;

  -- 別のSubscriptionで有効な行が既にある場合は subscriptions_user_active_idx の
  -- 一意制約違反で失敗させる（二重契約は自動で上書きせず、調査の対象にする）
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
END;
$$;

COMMENT ON FUNCTION public.confirm_subscription_onboarding IS
  '初回入会の確定（usersの入会時の項目・subscriptionsの作成・apply_rank_changeによる
  ランク変更の記録）を1トランザクションで行う。同じstripe_subscription_idのsubscriptions行が
  既にあれば何もしない（Webhook再配信の冪等性）。service role（Stripe Webhookハンドラー）
  からのみ呼び出す想定のため、他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION public.confirm_subscription_onboarding FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_subscription_onboarding FROM anon, authenticated;
