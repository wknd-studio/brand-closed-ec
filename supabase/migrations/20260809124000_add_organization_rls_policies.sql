-- 法人会員（B2B）対応: get_current_org_id()の新設と組織スコープRLSポリシー
-- specs/005-b2b-organization/research.md R2 の設計に基づく

-- ============================================================
-- RLS ヘルパー関数
-- Clerk JWT の org_id クレームから organizations.id を引く
-- アクティブ組織を選択していない場合（org_id が無い場合）は NULL を返す
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM public.organizations
  WHERE clerk_org_id = (auth.jwt() ->> 'org_id')
    AND deleted_at IS NULL
$$;

-- 現在のユーザーが所属する組織ID一覧。SECURITY DEFINERでRLSをバイパスすることで、
-- organization_memberships自身のRLSポリシーからの参照時に自己参照による
-- 再帰（＝常に空集合になる）を回避する。
CREATE OR REPLACE FUNCTION public.get_current_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id
  FROM public.organization_memberships
  WHERE user_id = get_current_user_id()
$$;

-- ============================================================
-- organizations: 自分が所属する組織のみ参照可（作成・更新・削除はサーバー側 service role のみ）
-- ============================================================

CREATE POLICY "organizations: select member" ON public.organizations
  FOR SELECT USING (id IN (SELECT get_current_org_ids()));

-- ============================================================
-- organization_memberships: 自分が所属する組織のメンバーシップのみ参照可
-- ============================================================

CREATE POLICY "organization_memberships: select same org" ON public.organization_memberships
  FOR SELECT USING (organization_id IN (SELECT get_current_org_ids()));

-- ============================================================
-- orders: 組織スコープの発注は同じ組織のメンバーであれば参照可
-- （個人の発注は user_id = get_current_user_id() の既存ポリシーで引き続きカバーされる）
-- ============================================================

CREATE POLICY "orders: select same org" ON public.orders
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT get_current_org_ids())
  );

-- ============================================================
-- addresses: 組織の共有住所帳は同じ組織のメンバーであれば参照可
-- （個人住所は user_id = get_current_user_id() の既存ポリシーで引き続きカバーされる）
-- ============================================================

CREATE POLICY "addresses: select same org" ON public.addresses
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT get_current_org_ids())
  );

CREATE POLICY "addresses: insert same org" ON public.addresses
  FOR INSERT WITH CHECK (
    organization_id IS NULL
    OR organization_id IN (SELECT get_current_org_ids())
  );

CREATE POLICY "addresses: update same org" ON public.addresses
  FOR UPDATE USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT get_current_org_ids())
  );

CREATE POLICY "addresses: delete same org" ON public.addresses
  FOR DELETE USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT get_current_org_ids())
  );
