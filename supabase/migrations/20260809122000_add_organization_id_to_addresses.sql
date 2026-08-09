-- 法人会員（B2B）対応: addressesテーブルへのorganization_id列追加
-- specs/005-b2b-organization/data-model.md の設計に基づく

ALTER TABLE public.addresses
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX addresses_organization_id_idx
  ON public.addresses(organization_id)
  WHERE organization_id IS NOT NULL;
