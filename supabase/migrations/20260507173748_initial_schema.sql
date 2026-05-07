-- ユーザー
create table public.users (
  id          uuid primary key,  -- Clerk user_id と紐付け
  email       text unique not null,
  rank        text not null default 'bronze' check (rank in ('bronze', 'silver', 'gold')),
  invited_by  uuid references public.users(id),
  created_at  timestamptz not null default now()
);

-- 招待コード
create table public.invitation_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  issued_by   uuid references public.users(id),
  used_by     uuid references public.users(id),
  expires_at  timestamptz not null,
  max_uses    int not null default 1,
  used_count  int not null default 0,
  created_at  timestamptz not null default now()
);

-- 商品
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       int not null check (price >= 0),
  min_rank    text not null default 'bronze' check (min_rank in ('bronze', 'silver', 'gold')),
  sanity_id   text,
  created_at  timestamptz not null default now()
);

-- 在庫
create table public.inventory (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id),
  sku         text not null,
  quantity    int not null default 0 check (quantity >= 0),
  reserved    int not null default 0 check (reserved >= 0),
  updated_at  timestamptz not null default now()
);

-- 注文
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  status            text not null default 'pending' check (status in ('pending', 'paid', 'shipped', 'cancelled')),
  stripe_session_id text unique,
  total_amount      int not null check (total_amount >= 0),
  created_at        timestamptz not null default now()
);

-- 注文明細
create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id),
  product_id  uuid not null references public.products(id),
  quantity    int not null check (quantity > 0),
  unit_price  int not null check (unit_price >= 0)
);

-- RLS を有効化
alter table public.users            enable row level security;
alter table public.invitation_codes enable row level security;
alter table public.products         enable row level security;
alter table public.inventory        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;

-- RLS ポリシー: users（自分のレコードのみ参照）
create policy "users: self only"
  on public.users for select
  using (auth.uid() = id);

-- RLS ポリシー: products（自分のランク以上の商品のみ参照）
create policy "products: rank filter"
  on public.products for select
  using (
    case min_rank
      when 'bronze' then true
      when 'silver' then (select rank from public.users where id = auth.uid()) in ('silver', 'gold')
      when 'gold'   then (select rank from public.users where id = auth.uid()) = 'gold'
    end
  );

-- RLS ポリシー: inventory（ログイン済みユーザーのみ参照）
create policy "inventory: authenticated only"
  on public.inventory for select
  using (auth.uid() is not null);

-- RLS ポリシー: orders（自分の注文のみ参照）
create policy "orders: self only"
  on public.orders for select
  using (auth.uid() = user_id);

-- RLS ポリシー: order_items（自分の注文明細のみ参照）
create policy "order_items: self only"
  on public.order_items for select
  using (
    auth.uid() = (select user_id from public.orders where id = order_id)
  );
