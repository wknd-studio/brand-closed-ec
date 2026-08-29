-- docs/db-schema-redesign.md「移行方針」6番（GitHub issue #170、親issue #165）。
--
-- users/organizationsの一意制約を、論理削除（deleted_at）を考慮しない通常のUNIQUEから
-- `WHERE deleted_at IS NULL`の部分UNIQUEインデックスへ変更する。
-- 理由（指摘3）: 通常のUNIQUEのままだと、退会（論理削除）後に同じClerkアカウント/
-- 同じStripe顧客で再登録しようとした際、削除済み行と衝突してINSERTが失敗する。
--
-- あわせて`organizations.stripe_customer_id`にはこれまでUNIQUE制約が存在せず`users`と
-- 非対称だった（指摘1）ため、この機会に部分UNIQUEを新設して揃える。

-- users.clerk_user_id: 通常UNIQUE → 部分UNIQUE
ALTER TABLE public.users DROP CONSTRAINT users_clerk_user_id_key;
CREATE UNIQUE INDEX users_clerk_user_id_active_idx
  ON public.users (clerk_user_id)
  WHERE deleted_at IS NULL;

-- users.stripe_customer_id: 通常UNIQUE → 部分UNIQUE
ALTER TABLE public.users DROP CONSTRAINT users_stripe_customer_id_key;
CREATE UNIQUE INDEX users_stripe_customer_id_active_idx
  ON public.users (stripe_customer_id)
  WHERE deleted_at IS NULL;

-- organizations.clerk_org_id: 通常UNIQUE → 部分UNIQUE
ALTER TABLE public.organizations DROP CONSTRAINT organizations_clerk_org_id_key;
CREATE UNIQUE INDEX organizations_clerk_org_id_active_idx
  ON public.organizations (clerk_org_id)
  WHERE deleted_at IS NULL;

-- organizations.stripe_customer_id: UNIQUE制約が無かったため新設（usersとの非対称を解消）
CREATE UNIQUE INDEX organizations_stripe_customer_id_active_idx
  ON public.organizations (stripe_customer_id)
  WHERE deleted_at IS NULL;
