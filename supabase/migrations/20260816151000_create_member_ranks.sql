-- ============================================================
-- member_ranks（参照テーブル・新設）
-- docs/db-schema-redesign.md「移行方針」1番、「member_ranks」節の設計に基づく
--
-- member_rankをENUMではなく行データの参照テーブルにする理由:
-- Postgres ENUMは値追加が同一トランザクション内で使えず、7ランク移行
-- （20260720084006/20260720084116）で2つのマイグレーションに分割する
-- 運用負債になった実績があるため。ランクの追加・改称・販売終了を通常の
-- INSERT/UPDATEで行えるようにする。
-- ============================================================

CREATE TABLE public.member_ranks (
  code                        TEXT PRIMARY KEY,
  sort_order                  SMALLINT NOT NULL UNIQUE,
  display_name_ja             TEXT NOT NULL,
  monthly_limit_amount        BIGINT,
  stripe_monthly_price_id     TEXT,
  stripe_initial_fee_price_id TEXT,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.member_ranks IS
  '会員ランクのマスタ。旧member_rank ENUMの置き換え。金額そのものの正はStripeダッシュボード（Price）であり、monthly_limit_amountのような業務ロジック固有の値のみここを正とする。';
COMMENT ON COLUMN public.member_ranks.monthly_limit_amount IS
  '月間仕入れ上限（円）。NULL = 無制限（enterprise想定）。';

CREATE TRIGGER member_ranks_updated_at
  BEFORE UPDATE ON public.member_ranks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS: 全会員が参照できる必要があるマスタデータ（FOR SELECT USING (true)）。
-- 書き込みは運営者のみだが、admin_users/admin_memberships（ステップ7）が
-- まだ存在しないため、当面はservice role経由のみに限定する。
-- ============================================================

ALTER TABLE public.member_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY member_ranks_select_all
  ON public.member_ranks
  FOR SELECT
  USING (true);

-- ============================================================
-- 初期データ: 現行7ランク分のマスタ行を投入する
-- monthly_limit_amountはsrc/domain/value-objects/member-rank.tsの
-- MONTHLY_LIMITS（TODO: TBDの暫定値）をそのまま移行する。
-- enterpriseはNumber.MAX_SAFE_INTEGERではなくNULL（無制限）で表現する。
-- ============================================================

INSERT INTO public.member_ranks (code, sort_order, display_name_ja, monthly_limit_amount) VALUES
  ('starter',    0, 'スターター',   300000),
  ('basic',      1, 'ベーシック',   1000000),
  ('standard',   2, 'スタンダード', 5000000),
  ('pro',        3, 'プロ',         20000000),
  ('advanced',   4, 'アドバンス',   50000000),
  ('premium',    5, 'プレミアム',   100000000),
  ('enterprise', 6, 'エンタープライズ', NULL);
