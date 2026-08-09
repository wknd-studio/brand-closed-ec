-- ============================================================
-- 法人会員（B2B）対応: organizations / organization_memberships
-- specs/005-b2b-organization/data-model.md の設計に基づく
-- ============================================================

-- ============================================================
-- organizations
-- ============================================================

CREATE TABLE public.organizations (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_org_id                     TEXT UNIQUE NOT NULL,
  name                             TEXT NOT NULL,
  representative_name              TEXT NOT NULL,
  phone_number                     TEXT NOT NULL,
  postal_code                      TEXT NOT NULL,
  prefecture                       TEXT NOT NULL,
  city                             TEXT NOT NULL,
  address_line1                    TEXT NOT NULL,
  address_line2                    TEXT,
  invoice_registration_number      TEXT NOT NULL
    CHECK (invoice_registration_number ~ '^T\d{13}$'),
  onboarding_completed             BOOLEAN NOT NULL DEFAULT false,
  rank                             public.member_rank NOT NULL DEFAULT 'starter',
  billing_anchor_day               SMALLINT
    CHECK (billing_anchor_day IS NULL OR billing_anchor_day BETWEEN 1 AND 28),
  pending_rank                     public.member_rank,
  stripe_customer_id               TEXT,
  stripe_subscription_id           TEXT,
  stripe_subscription_schedule_id  TEXT,
  initial_fee_paid_rank            public.member_rank,
  deleted_at                       TIMESTAMPTZ,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- organization_memberships
-- ============================================================

CREATE TABLE public.organization_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  clerk_role      TEXT NOT NULL CHECK (clerk_role IN ('org:admin', 'org:member')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_memberships_organization_id_idx
  ON public.organization_memberships(organization_id);
CREATE INDEX organization_memberships_user_id_idx
  ON public.organization_memberships(user_id);

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- RLSポリシーは T007 (add_organization_rls_policies) で追加する
