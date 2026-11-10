-- ============================================================
-- 会員が自分の users 行を直接書き換えられないようにする
-- GitHub issue #621
--
-- "users: update own" は更新できる列を絞っていなかったため、会員が自分の Clerk の
-- セッショントークンと公開されている anon key で PostgREST に直接 PATCH /users を送ると、
-- rank_code・onboarding_completed・stripe_customer_id・deleted_at 等を書き換えられた。
-- アプリの users への書き込みはすべて admin クライアント（service role）で行っていて、
-- 会員が自分で書いてよい列は無いため、列を絞るのではなくポリシーごと消す。
-- UPDATE のポリシーが無くなるため、会員のトークンでの UPDATE は0行の更新になる。
-- ============================================================

DROP POLICY "users: update own" ON public.users;
