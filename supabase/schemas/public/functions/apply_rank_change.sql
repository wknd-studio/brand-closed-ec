CREATE OR REPLACE FUNCTION public.apply_rank_change (
  p_user_id                uuid,
  p_from_rank_code         text,
  p_to_rank_code           text,
  p_changed_by             text,
  p_initial_fee_charged    boolean,
  p_stripe_subscription_id text
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
BEGIN
  UPDATE public.users u
  SET
    rank_code = p_to_rank_code,
    initial_fee_paid_rank_code = CASE
      WHEN NOT p_initial_fee_charged THEN u.initial_fee_paid_rank_code
      WHEN u.initial_fee_paid_rank_code IS NULL THEN p_to_rank_code
      WHEN (SELECT sort_order FROM public.member_ranks WHERE code = p_to_rank_code)
         > (SELECT sort_order FROM public.member_ranks WHERE code = u.initial_fee_paid_rank_code)
        THEN p_to_rank_code
      ELSE u.initial_fee_paid_rank_code
    END
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.rank_changes (
    user_id, from_rank_code, to_rank_code, changed_by,
    initial_fee_charged, stripe_subscription_id
  ) VALUES (
    p_user_id, p_from_rank_code, p_to_rank_code, p_changed_by,
    p_initial_fee_charged, p_stripe_subscription_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_rank_change"(uuid, text, text, text, boolean, text) TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."apply_rank_change"(uuid, text, text, text, boolean, text) IS 'users.rank_code・initial_fee_paid_rank_codeの更新とrank_changesへのINSERTを同時に行う
  （呼び出し元のトランザクション内で実行される）。initial_fee_paid_rank_codeは、初期費用を
  請求した変更で新しいランクの方が高いときだけ上げる。service roleからのみ呼び出す想定のため、
  他ロールへのEXECUTE権限は付与しない。';

REVOKE ALL ON FUNCTION "public"."apply_rank_change"(uuid, text, text, text, boolean, text) FROM PUBLIC;
