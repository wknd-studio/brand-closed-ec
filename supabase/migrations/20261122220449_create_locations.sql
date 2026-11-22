-- ============================================================
-- locations（参照テーブル・新設）と order_items.fulfillment_location_code
-- docs/db-schema-redesign.md「locations」節・「order_items」節・移行方針ステップ13、GitHub issue #354
--
-- 商品は「事務所を経由して届く」ものと「仕入れ先から顧客へ直送される」ものが混在し、
-- 事務所経由なら出荷前に入荷検品（order_items.received_at）が必要になる。この配送ルートを
-- CHECK制約ではなく行データとして持ち、ロケーションが増えてもINSERTだけで対応できるようにする
-- （member_ranks と同じ考え方）。
-- ============================================================

CREATE TABLE public.locations (
  code                TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  requires_receiving  BOOLEAN NOT NULL,
  postal_code         TEXT,
  prefecture          TEXT,
  city                TEXT,
  address_line1       TEXT,
  address_line2       TEXT,
  phone_number        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.locations IS
  '商品が出発する配送「元」のマスタ（issue #354）。顧客が指定する配送「先」の addresses とは別物で、参照もしない。';
COMMENT ON COLUMN public.locations.requires_receiving IS
  'この拠点経由の明細は、出荷前に事務所での入荷検品（order_items.received_at）を必須とするか。';
COMMENT ON COLUMN public.locations.postal_code IS
  '住所・電話番号は office 行のみ想定。リポジトリに実際の住所を書かないため、マイグレーションではNULLのまま入れ、環境ごとにSQLで設定する。';

CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS: 顧客（anon/authenticated）が見る必要は無いため、ポリシーを設けず
-- service role（運営者の画面・注文確定の関数）からだけ読み書きする
-- ============================================================

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 初期データ
-- ============================================================

INSERT INTO public.locations (code, name, requires_receiving) VALUES
  ('office',          '事務所',       true),
  ('supplier_direct', '仕入れ先直送', false);

-- ============================================================
-- order_items.fulfillment_location_code: 明細ごとに注文時点の配送ルートを残す
-- place_order_with_limit_check・save_order はまだこの列を入れないため、
-- 注文確定を壊さないよう当面は DEFAULT 'office' を付ける。#357 で明示的に値を
-- 入れるようにしたうえで既定値を外す（実データが無いためバックフィル不要）
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN fulfillment_location_code TEXT NOT NULL DEFAULT 'office'
    REFERENCES public.locations(code);

COMMENT ON COLUMN public.order_items.fulfillment_location_code IS
  'この明細が事務所経由（office）か仕入れ先直送（supplier_direct）かの、注文時点のスナップショット。DEFAULT ''office'' は #357 で外す暫定。';

CREATE INDEX order_items_fulfillment_location_code_idx
  ON public.order_items(fulfillment_location_code);
