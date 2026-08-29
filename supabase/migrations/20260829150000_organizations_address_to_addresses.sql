-- ============================================================
-- organizationsの住所カラムをaddresses（type='headquarters'）へ統合する
-- docs/db-schema-redesign.md「移行方針」5番の設計に基づく
-- GitHub issue #169（親issue #165）
--
-- pre-launchのため実データが無く（develop/stg含む）、無停止移行の段階的
-- 手順は不要（親issue #165の方針）。addresses.typeをENUM→TEXT+CHECKに
-- 変更して'headquarters'を追加した上でバックフィルし、旧カラムを直接
-- DROPする。
-- ============================================================

-- ============================================================
-- addresses.type: ENUM(address_type) → TEXT+CHECKへ変更し、
-- 'headquarters'を追加する
-- ============================================================

ALTER TABLE public.addresses
  ALTER COLUMN type TYPE TEXT USING type::TEXT;

ALTER TABLE public.addresses
  ADD CONSTRAINT addresses_type_check
  CHECK (type IN ('billing', 'shipping', 'headquarters'));

DROP TYPE public.address_type;

COMMENT ON COLUMN public.addresses.type IS
  '配送先・請求先・本店所在地の区別。旧address_type ENUM列を置き換え
  （TEXT+CHECK）。headquarters追加によりorganizationsの住所カラムを
  このテーブルに統合できるようにした。';

-- 1組織につき本店所在地は法的に1件のみという業務ルールをDB制約で表現する
CREATE UNIQUE INDEX addresses_organization_headquarters_idx
  ON public.addresses(organization_id)
  WHERE type = 'headquarters';

-- ============================================================
-- バックフィル: 既存organizationsの住所カラムをaddresses(headquarters)へ
-- コピーする。誰が登録したかの記録（addresses.user_id NOT NULL）には、
-- その組織のorg:admin権限を持つメンバーを充てる（複数いる場合は
-- 作成日時が最も古いものを採用）。org:adminが存在しない組織は
-- バックフィル対象外とする（本来あり得ないデータ不整合のため）。
-- 現時点でstripe_subscription_id等と同様、実際に該当する行は無い想定。
-- ============================================================

INSERT INTO public.addresses (
  user_id, organization_id, type, is_default,
  recipient_last_name, recipient_first_name,
  postal_code, prefecture, city, address_line1, address_line2,
  phone_number, created_at, updated_at
)
SELECT DISTINCT ON (o.id)
  om.user_id, o.id, 'headquarters', true,
  o.representative_name, '',
  o.postal_code, o.prefecture, o.city, o.address_line1, o.address_line2,
  o.phone_number, o.created_at, o.created_at
FROM public.organizations o
JOIN public.organization_memberships om
  ON om.organization_id = o.id AND om.clerk_role = 'org:admin'
ORDER BY o.id, om.created_at ASC;

-- ============================================================
-- 旧住所カラムを削除する。バックフィル後のためデータは失われない。
-- ============================================================

ALTER TABLE public.organizations
  DROP COLUMN postal_code,
  DROP COLUMN prefecture,
  DROP COLUMN city,
  DROP COLUMN address_line1,
  DROP COLUMN address_line2;
