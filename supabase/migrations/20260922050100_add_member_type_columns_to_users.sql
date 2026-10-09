-- ============================================================
-- GitHub issue #200: 法人会員を個人と同じ1アカウント方式で実装する
-- 複数メンバー共有型の法人組織（organizations）はVer1では見送り、
-- 法人会員も個人と同じ「1アカウント＝1担当者」として扱う。
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN member_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (member_type IN ('individual', 'corporate')),
  ADD COLUMN company_name TEXT,
  ADD COLUMN invoice_registration_number TEXT
    CHECK (invoice_registration_number IS NULL OR invoice_registration_number ~ '^T\d{13}$');

ALTER TABLE public.users
  ADD CONSTRAINT users_corporate_requires_company_name
    CHECK (member_type <> 'corporate' OR company_name IS NOT NULL),
  ADD CONSTRAINT users_corporate_requires_invoice_registration_number
    CHECK (member_type <> 'corporate' OR invoice_registration_number IS NOT NULL);
