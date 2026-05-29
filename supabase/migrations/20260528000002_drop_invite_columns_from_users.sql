ALTER TABLE public.users
  DROP COLUMN IF EXISTS can_invite,
  DROP COLUMN IF EXISTS invite_limit;
