-- ============================================================
-- BRAND クローズドEC 初期スキーマ
-- docs/data-model.md の設計に基づく
-- ============================================================

-- ============================================================
-- ENUM 型
-- ============================================================

CREATE TYPE public.member_rank AS ENUM (
  'free', 'entry', 'standard', 'pro', 'enterprise'
);

CREATE TYPE public.address_type AS ENUM (
  'billing', 'shipping'
);

CREATE TYPE public.order_payment_flow AS ENUM (
  'checkout', 'invoice'
);

CREATE TYPE public.order_status AS ENUM (
  'pending_payment',  -- 決済待ち（Checkout フロー）
  'confirming',       -- 注文確認中（Invoice フロー）
  'invoice_sent',     -- 請求書送付済み
  'paid',             -- 入金確認済み
  'sourcing',         -- 手配中
  'ordered',          -- 発注完了
  'preparing',        -- 発送準備中
  'shipping',         -- 配送中
  'delivered',        -- 配送完了
  'cancelled'         -- キャンセル
);

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- users
-- ============================================================

CREATE TABLE public.users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id          TEXT UNIQUE NOT NULL,
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  email                  TEXT NOT NULL,
  first_name             TEXT NOT NULL DEFAULT '',
  last_name              TEXT NOT NULL DEFAULT '',
  rank                   public.member_rank NOT NULL DEFAULT 'free',
  subscribed_at          TIMESTAMPTZ,
  onboarding_completed   BOOLEAN NOT NULL DEFAULT false,
  terms_agreed_at        TIMESTAMPTZ,
  terms_version          TEXT,
  can_invite             BOOLEAN NOT NULL DEFAULT false,
  invite_limit           INTEGER NOT NULL DEFAULT 0,
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- addresses
-- ============================================================

CREATE TABLE public.addresses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.users(id),
  type                 public.address_type NOT NULL,
  is_default           BOOLEAN NOT NULL DEFAULT false,
  recipient_last_name  TEXT NOT NULL,
  recipient_first_name TEXT NOT NULL,
  postal_code          TEXT NOT NULL,
  prefecture           TEXT NOT NULL,
  city                 TEXT NOT NULL,
  address_line1        TEXT NOT NULL,
  address_line2        TEXT,
  phone_number         TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX addresses_user_id_idx ON public.addresses(user_id);

CREATE TRIGGER addresses_updated_at
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- invitation_codes
-- ============================================================

CREATE TABLE public.invitation_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT UNIQUE NOT NULL,
  issued_by_user_id UUID REFERENCES public.users(id),  -- null = 管理者発行
  expires_at        TIMESTAMPTZ,
  max_uses          INTEGER,                            -- null = 無制限
  used_count        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invitation_codes_code_idx ON public.invitation_codes(code);
CREATE INDEX invitation_codes_issued_by_idx ON public.invitation_codes(issued_by_user_id);

ALTER TABLE public.invitation_codes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- invitation_uses
-- ============================================================

CREATE TABLE public.invitation_uses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_code_id  UUID NOT NULL REFERENCES public.invitation_codes(id),
  used_by_user_id     UUID NOT NULL REFERENCES public.users(id),
  used_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invitation_uses_code_id_idx ON public.invitation_uses(invitation_code_id);
CREATE INDEX invitation_uses_user_id_idx ON public.invitation_uses(used_by_user_id);

ALTER TABLE public.invitation_uses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- orders
-- ============================================================

CREATE TABLE public.orders (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES public.users(id),
  payment_flow               public.order_payment_flow NOT NULL,
  status                     public.order_status NOT NULL DEFAULT 'pending_payment',
  shipping_address_snapshot  JSONB NOT NULL,
  billing_address_snapshot   JSONB NOT NULL,
  rank_at_order              public.member_rank NOT NULL,
  monthly_limit_at_order     BIGINT NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_invoice_id          TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_user_id_idx ON public.orders(user_id);
CREATE INDEX orders_status_idx ON public.orders(status);
CREATE INDEX orders_stripe_checkout_session_id_idx
  ON public.orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX orders_stripe_invoice_id_idx
  ON public.orders(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- order_items
-- ============================================================

CREATE TABLE public.order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES public.orders(id),
  sanity_product_id     TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_price_snapshot   BIGINT,           -- null = 要相談商品
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  is_negotiable         BOOLEAN NOT NULL DEFAULT false,
  negotiated_unit_price BIGINT,           -- 運営者が請求書発行時に確定
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- cart_items
-- ============================================================

CREATE TABLE public.cart_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id),
  sanity_product_id TEXT NOT NULL,
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sanity_product_id)
);

CREATE INDEX cart_items_user_id_idx ON public.cart_items(user_id);

CREATE TRIGGER cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- favorites
-- ============================================================

CREATE TABLE public.favorites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id),
  sanity_product_id TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sanity_product_id)
);

CREATE INDEX favorites_user_id_idx ON public.favorites(user_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS ヘルパー関数
-- Clerk JWT の sub クレームから users.id を引く
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.users
  WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    AND deleted_at IS NULL
$$;

-- ============================================================
-- RLS ポリシー
-- ============================================================

-- users: 自分のレコードのみ参照・更新可（作成・削除はサーバー側 service role のみ）
CREATE POLICY "users: select own" ON public.users
  FOR SELECT USING (id = get_current_user_id());

CREATE POLICY "users: update own" ON public.users
  FOR UPDATE USING (id = get_current_user_id());

-- addresses: 自分のレコードのみ CRUD 可
CREATE POLICY "addresses: select own" ON public.addresses
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "addresses: insert own" ON public.addresses
  FOR INSERT WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "addresses: update own" ON public.addresses
  FOR UPDATE USING (user_id = get_current_user_id());

CREATE POLICY "addresses: delete own" ON public.addresses
  FOR DELETE USING (user_id = get_current_user_id());

-- invitation_codes: 自分が発行したコードのみ参照可（作成・更新はサーバー側のみ）
CREATE POLICY "invitation_codes: select own" ON public.invitation_codes
  FOR SELECT USING (issued_by_user_id = get_current_user_id());

-- invitation_uses: 自分が使ったレコードのみ参照可
CREATE POLICY "invitation_uses: select own" ON public.invitation_uses
  FOR SELECT USING (used_by_user_id = get_current_user_id());

-- orders: 自分の注文のみ参照可（作成・更新はサーバー側のみ）
CREATE POLICY "orders: select own" ON public.orders
  FOR SELECT USING (user_id = get_current_user_id());

-- order_items: 自分の注文に紐づく明細のみ参照可
CREATE POLICY "order_items: select own" ON public.order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = get_current_user_id()
    )
  );

-- cart_items: 自分のカートのみ CRUD 可
CREATE POLICY "cart_items: select own" ON public.cart_items
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "cart_items: insert own" ON public.cart_items
  FOR INSERT WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "cart_items: update own" ON public.cart_items
  FOR UPDATE USING (user_id = get_current_user_id());

CREATE POLICY "cart_items: delete own" ON public.cart_items
  FOR DELETE USING (user_id = get_current_user_id());

-- favorites: 自分のお気に入りのみ CRUD 可
CREATE POLICY "favorites: select own" ON public.favorites
  FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "favorites: insert own" ON public.favorites
  FOR INSERT WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "favorites: delete own" ON public.favorites
  FOR DELETE USING (user_id = get_current_user_id());
