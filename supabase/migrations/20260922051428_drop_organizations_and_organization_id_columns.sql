-- ============================================================
-- GitHub issue #200: 法人会員を個人と同じ1アカウント方式で実装する
-- 複数メンバー共有型の法人組織（organizations/organization_memberships）を
-- Ver1では見送るため、テーブル本体・organization_id列・関連RLS/関数を削除する。
-- 復活手順はdocs/domain/membership.mdに記載する。
-- ============================================================

-- ------------------------------------------------------------
-- 1. organization_idを参照するRLSポリシーを先に削除
-- ------------------------------------------------------------

DROP POLICY "orders: select same org" ON public.orders;
DROP POLICY "addresses: select same org" ON public.addresses;
DROP POLICY "addresses: insert same org" ON public.addresses;
DROP POLICY "addresses: update same org" ON public.addresses;
DROP POLICY "addresses: delete same org" ON public.addresses;
DROP POLICY "subscriptions: select same org" ON public.subscriptions;
DROP POLICY "rank_changes: select same org" ON public.rank_changes;
DROP POLICY "order_settlements: select same org" ON public.order_settlements;

-- ------------------------------------------------------------
-- 2. subscriptions/rank_changesのowner_exclusive制約を外し、
--    user_idをNOT NULLにする（organization_id削除後は唯一の所有者列になるため）
-- ------------------------------------------------------------

ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_owner_exclusive;
DELETE FROM public.subscriptions WHERE user_id IS NULL;
ALTER TABLE public.subscriptions ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.rank_changes DROP CONSTRAINT rank_changes_owner_exclusive;
DELETE FROM public.rank_changes WHERE user_id IS NULL;
ALTER TABLE public.rank_changes ALTER COLUMN user_id SET NOT NULL;

-- ------------------------------------------------------------
-- 3. organization_id列の削除（依存インデックスも合わせて削除される）
-- ------------------------------------------------------------

ALTER TABLE public.orders DROP COLUMN organization_id;
ALTER TABLE public.addresses DROP COLUMN organization_id;
ALTER TABLE public.subscriptions DROP COLUMN organization_id;
ALTER TABLE public.rank_changes DROP COLUMN organization_id;

-- ------------------------------------------------------------
-- 4. organization_memberships → organizations の順にテーブル本体を削除
-- ------------------------------------------------------------

DROP TABLE public.organization_memberships;
DROP TABLE public.organizations;

-- ------------------------------------------------------------
-- 5. organizationsのみに依存していたRLSヘルパー関数を削除
-- ------------------------------------------------------------

DROP FUNCTION public.get_current_org_ids();
DROP FUNCTION public.get_current_org_id();
