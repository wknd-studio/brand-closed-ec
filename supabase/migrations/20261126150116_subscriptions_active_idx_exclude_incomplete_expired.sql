-- 会員につき解約済みでないサブスクリプションは1件まで、という部分UNIQUEインデックスの
-- 除外条件を、domain が解約済みとする状態に揃える（issue #777）。
-- 解約済みの状態の正は src/domain/value-objects/subscription-status.ts の
-- SubscriptionStatus.endedValues()（canceled・incomplete_expired）。インデックスは
-- TypeScript を参照できないため、同じ状態が除外されていることを
-- tests/integration/subscriptions-schema.test.ts で確かめる。
-- 除外する状態を増やすだけで一意の条件は緩むため、既存の行が違反することは無い。
-- organization_id の削除（20260922051428）で user_id は NOT NULL のため、user_id IS NOT NULL の条件は外す
DROP INDEX public.subscriptions_user_active_idx;

CREATE UNIQUE INDEX subscriptions_user_active_idx
  ON public.subscriptions(user_id)
  WHERE status NOT IN ('canceled', 'incomplete_expired');
