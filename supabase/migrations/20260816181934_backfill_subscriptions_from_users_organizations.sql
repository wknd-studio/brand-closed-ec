-- ============================================================
-- users/organizationsの既存Stripeカラムからsubscriptionsへバックフィル
-- docs/db-schema-redesign.md「移行方針」3番の設計に基づく
-- GitHub issue #167（親issue #165）
--
-- pre-launchのため実データが無く（develop/stg含む）、無停止移行の段階的
-- 手順は不要（親issue #165の方針）。ALTER TABLEで直接カラムをリネーム・
-- 削除し、バックフィルはINSERT ... SELECTで実施する。現時点では
-- stripe_subscription_idを持つ行が存在しないため実際には0行処理される。
-- ============================================================

-- ============================================================
-- users: rank(ENUM) → rank_code(TEXT, FK member_ranks) へリネーム・変換。
-- billing_anchor_day / initial_fee_paid_rank_code を新設する。
-- ============================================================

ALTER TABLE public.users
  ALTER COLUMN rank TYPE TEXT USING rank::TEXT;

ALTER TABLE public.users
  RENAME COLUMN rank TO rank_code;

ALTER TABLE public.users
  ALTER COLUMN rank_code SET DEFAULT 'starter';

ALTER TABLE public.users
  ADD CONSTRAINT users_rank_code_fkey
  FOREIGN KEY (rank_code) REFERENCES public.member_ranks(code);

ALTER TABLE public.users
  ADD COLUMN billing_anchor_day SMALLINT
    CHECK (billing_anchor_day IS NULL OR billing_anchor_day BETWEEN 1 AND 28);

ALTER TABLE public.users
  ADD COLUMN initial_fee_paid_rank_code TEXT REFERENCES public.member_ranks(code);

COMMENT ON COLUMN public.users.rank_code IS
  '現在の会員ランク（非正規化キャッシュ）。更新は必ずrank_changesへのINSERTと同一トランザクションで行う。旧member_rank ENUM列（rank）を置き換え。';
COMMENT ON COLUMN public.users.initial_fee_paid_rank_code IS
  'これまでに初期費用を支払った中で最も高いランク。アップグレード時の初期費用二重課金判定に使うキャッシュ。';

-- ============================================================
-- organizations: rank/initial_fee_paid_rank(ENUM) → rank_code/
-- initial_fee_paid_rank_code(TEXT, FK member_ranks) へリネーム・変換する。
-- ============================================================

ALTER TABLE public.organizations
  ALTER COLUMN rank TYPE TEXT USING rank::TEXT;

ALTER TABLE public.organizations
  RENAME COLUMN rank TO rank_code;

ALTER TABLE public.organizations
  ALTER COLUMN rank_code SET DEFAULT 'starter';

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_rank_code_fkey
  FOREIGN KEY (rank_code) REFERENCES public.member_ranks(code);

ALTER TABLE public.organizations
  ALTER COLUMN initial_fee_paid_rank TYPE TEXT USING initial_fee_paid_rank::TEXT;

ALTER TABLE public.organizations
  RENAME COLUMN initial_fee_paid_rank TO initial_fee_paid_rank_code;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_initial_fee_paid_rank_code_fkey
  FOREIGN KEY (initial_fee_paid_rank_code) REFERENCES public.member_ranks(code);

COMMENT ON COLUMN public.organizations.rank_code IS
  'users.rank_codeと同じ理由（高頻度に評価される認可判定のための非正規化キャッシュ）。';
COMMENT ON COLUMN public.organizations.initial_fee_paid_rank_code IS
  'users.initial_fee_paid_rank_codeと同じ理由。命名を統一（旧initial_fee_paid_rank）。';

-- ============================================================
-- バックフィル1: 既存のStripe契約情報をsubscriptionsへコピーする。
-- 個人・法人どちらも「stripe_subscription_id/stripe_customer_idが両方
-- 設定済み」の行のみを対象にする（未契約・不完全な行は対象外）。
-- statusは旧カラムに保持していなかったため'active'とみなし、契約期間は
-- 旧カラムに存在する日時から1ヶ月分を仮置きする（Stripe側が正データであり、
-- 実際の値は次回Webhook受信時に上書きされる想定）。
-- ============================================================

INSERT INTO public.subscriptions (
  user_id, stripe_customer_id, stripe_subscription_id,
  status, rank_code, current_period_start, current_period_end,
  created_at, updated_at
)
SELECT
  id, stripe_customer_id, stripe_subscription_id,
  'active', rank_code,
  COALESCE(subscribed_at, created_at),
  COALESCE(subscribed_at, created_at) + INTERVAL '1 month',
  created_at, updated_at
FROM public.users
WHERE stripe_subscription_id IS NOT NULL
  AND stripe_customer_id IS NOT NULL;

INSERT INTO public.subscriptions (
  organization_id, stripe_customer_id, stripe_subscription_id,
  stripe_subscription_schedule_id, status, rank_code, pending_rank_code,
  current_period_start, current_period_end, created_at
)
SELECT
  id, stripe_customer_id, stripe_subscription_id,
  stripe_subscription_schedule_id, 'active', rank_code, pending_rank,
  created_at, created_at + INTERVAL '1 month', created_at
FROM public.organizations
WHERE stripe_subscription_id IS NOT NULL
  AND stripe_customer_id IS NOT NULL;

-- ============================================================
-- バックフィル2: 既存のrank_code/initial_fee_paid_rank_codeを起点に、
-- rank_changesの初期1行を生成する（from_rank_code = NULL、changed_by =
-- 'system'）。全会員が対象（無料ランクのみの会員も「starterから始まった」
-- という来歴の起点を持つため）。
-- ============================================================

INSERT INTO public.rank_changes (
  user_id, from_rank_code, to_rank_code, changed_by,
  initial_fee_charged, effective_at, created_at
)
SELECT
  id, NULL, rank_code, 'system',
  (initial_fee_paid_rank_code IS NOT NULL),
  COALESCE(subscribed_at, created_at), created_at
FROM public.users;

INSERT INTO public.rank_changes (
  organization_id, from_rank_code, to_rank_code, changed_by,
  initial_fee_charged, effective_at, created_at
)
SELECT
  id, NULL, rank_code, 'system',
  (initial_fee_paid_rank_code IS NOT NULL),
  created_at, created_at
FROM public.organizations;

-- ============================================================
-- 旧Stripe関連カラムを削除する。バックフィル後のためデータは失われない。
-- ============================================================

ALTER TABLE public.users
  DROP COLUMN stripe_subscription_id,
  DROP COLUMN subscribed_at;

ALTER TABLE public.organizations
  DROP COLUMN pending_rank,
  DROP COLUMN stripe_subscription_id,
  DROP COLUMN stripe_subscription_schedule_id;
