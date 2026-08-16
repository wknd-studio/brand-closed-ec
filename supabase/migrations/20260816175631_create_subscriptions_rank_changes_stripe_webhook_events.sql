-- ============================================================
-- subscriptions / rank_changes / stripe_webhook_events（新設）
-- docs/db-schema-redesign.md「移行方針」2番、各テーブル節の設計に基づく
-- GitHub issue #166（親issue #165）
-- ============================================================

-- ============================================================
-- subscriptions
-- Stripe Subscriptionオブジェクトの現在値ミラー。
-- users/organizationsに直書きされていたstripe_subscription_id等を切り出す。
-- 個人・法人どちらのサブスクリプションも同じ形で扱う。
-- ============================================================

CREATE TABLE public.subscriptions (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                           UUID REFERENCES public.users(id),
  organization_id                  UUID REFERENCES public.organizations(id),
  stripe_customer_id                TEXT NOT NULL,
  stripe_subscription_id            TEXT NOT NULL UNIQUE,
  stripe_subscription_schedule_id   TEXT,
  status                            TEXT NOT NULL CHECK (status IN (
                                       'trialing', 'active', 'past_due', 'unpaid',
                                       'canceled', 'incomplete', 'incomplete_expired'
                                     )),
  rank_code                         TEXT NOT NULL REFERENCES public.member_ranks(code),
  pending_rank_code                 TEXT REFERENCES public.member_ranks(code),
  current_period_start              TIMESTAMPTZ NOT NULL,
  current_period_end                TIMESTAMPTZ NOT NULL,
  cancel_at_period_end              BOOLEAN NOT NULL DEFAULT false,
  canceled_at                       TIMESTAMPTZ,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_owner_exclusive CHECK (num_nonnulls(user_id, organization_id) = 1)
);

COMMENT ON TABLE public.subscriptions IS
  'Stripe Subscriptionオブジェクトの現在値ミラー。user_id/organization_idは排他（どちらか一方のみ非NULL）。来歴はrank_changesが別途持つ。';

-- 所有者ごとに解約済み以外は1件まで。解約済み行は残したまま除外することで、
-- 過去の契約履歴を消さずに「乗り換え（解約→再契約）」を表現できる。
CREATE UNIQUE INDEX subscriptions_user_active_idx
  ON public.subscriptions(user_id) WHERE user_id IS NOT NULL AND status <> 'canceled';
CREATE UNIQUE INDEX subscriptions_organization_active_idx
  ON public.subscriptions(organization_id) WHERE organization_id IS NOT NULL AND status <> 'canceled';

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions(user_id);
CREATE INDEX subscriptions_organization_id_idx ON public.subscriptions(organization_id);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 参照は本人・所属組織メンバーのみ。作成・更新・削除はStripe Webhook経由の
-- service roleのみで行うため、クライアント向けのINSERT/UPDATE/DELETEポリシーは設けない。
CREATE POLICY "subscriptions: select own" ON public.subscriptions
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "subscriptions: select same org" ON public.subscriptions
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT get_current_org_ids())
  );

-- ============================================================
-- rank_changes（追記専用）
-- 「いつ・誰の操作で・どのランクからどのランクに変わったか」の来歴。
-- UPDATE/DELETEを行わない（訂正が必要な場合も打ち消し行を追加する運用）。
-- ============================================================

CREATE TABLE public.rank_changes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES public.users(id),
  organization_id        UUID REFERENCES public.organizations(id),
  from_rank_code         TEXT REFERENCES public.member_ranks(code),
  to_rank_code           TEXT NOT NULL REFERENCES public.member_ranks(code),
  changed_by             TEXT NOT NULL CHECK (changed_by IN ('member', 'admin', 'system')),
  initial_fee_charged    BOOLEAN NOT NULL DEFAULT false,
  stripe_subscription_id TEXT,
  reason                 TEXT,
  effective_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rank_changes_owner_exclusive CHECK (num_nonnulls(user_id, organization_id) = 1)
);

COMMENT ON TABLE public.rank_changes IS
  'ランク変更の追記専用来歴。UPDATE/DELETEは行わない（訂正は打ち消し行の追加で表現する）。users.rank_code/organizations.rank_codeの更新は、必ず対応するこのテーブルへのINSERTと同一トランザクションで行う。';

CREATE INDEX rank_changes_user_id_idx ON public.rank_changes(user_id);
CREATE INDEX rank_changes_organization_id_idx ON public.rank_changes(organization_id);

ALTER TABLE public.rank_changes ENABLE ROW LEVEL SECURITY;

-- 参照は本人・所属組織メンバーのみ。追記専用のためINSERT/UPDATE/DELETEの
-- クライアント向けポリシーは設けず、service role経由のみに限定する。
CREATE POLICY "rank_changes: select own" ON public.rank_changes
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "rank_changes: select same org" ON public.rank_changes
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT get_current_org_ids())
  );

-- ============================================================
-- stripe_webhook_events
-- Stripeは同一イベントを複数回配信することがある（公式仕様）。
-- event_idをPKにし、INSERT ... ON CONFLICT DO NOTHINGの1クエリで
-- 重複配信をDB側で機械的に排除する。
-- ============================================================

CREATE TABLE public.stripe_webhook_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  payload      JSONB NOT NULL,
  error        TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.stripe_webhook_events IS
  'Stripe Webhookイベントの冪等性テーブル。処理パターン: INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id。行が返らなければ処理済み/処理中と判定してスキップする。';

CREATE INDEX stripe_webhook_events_status_idx ON public.stripe_webhook_events(status);

-- クライアント（会員・組織メンバー）が参照する用途は無く、Stripe Webhookハンドラーの
-- service roleのみが読み書きする内部テーブルのため、クライアント向けポリシーは設けない
-- （RLSを有効化するのみで、anon/authenticatedからは全行が既定で不可視になる）。
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
