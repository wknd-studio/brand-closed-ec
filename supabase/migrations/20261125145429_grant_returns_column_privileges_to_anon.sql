-- ============================================================
-- returns / return_items: 会員の権限を anon にも付ける（issue #381・PR #779）
--
-- Clerk のセッショントークンには role クレームが無く、PostgREST は会員の操作を anon ロールで
-- 実行する（RLS は get_current_user_id() が sub から会員を引いて絞る）。他の表は anon にも
-- authenticated と同じ権限がある（20260704110728_grant_authenticated_privileges.sql）が、
-- returns / return_items（20261123070936）は authenticated にだけ付けていたため、
-- 会員の注文詳細・返品の申請が 42501（permission denied）になっていた。
--
-- authenticated と同じカラムだけを付け、admin_note・運営者のID 等は anon からも読めないままにする。
-- RLS のポリシーはロールを指定していない（PUBLIC）ため anon にも効き、トークンの無い操作は
-- get_current_user_id() が NULL になり、どの行も読めず書けない
-- ============================================================

GRANT SELECT (
  id, order_id, status, requested_by_user_id, reason,
  stripe_refund_id, refund_amount, approved_at, received_at, refunded_at,
  created_at, updated_at
) ON public.returns TO anon;
GRANT INSERT (id, order_id, status, requested_by_user_id, reason)
  ON public.returns TO anon;

GRANT SELECT (id, return_id, order_item_id, quantity, refund_amount, created_at)
  ON public.return_items TO anon;
GRANT INSERT (id, return_id, order_item_id, quantity)
  ON public.return_items TO anon;
