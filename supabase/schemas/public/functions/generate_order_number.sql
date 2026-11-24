CREATE OR REPLACE FUNCTION public.generate_order_number (
  p_candidates text[] DEFAULT '{}'::text[]
)
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  -- Crockford Base32 の32文字（値 0〜31 の順）
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  -- 乱数で作り直す回数の上限（重なり続けるのは乱数の異常のため、無限に回さない）
  c_max_random_attempts constant int := 10;
  v_candidate_count int := coalesce(array_length(p_candidates, 1), 0);
  v_attempt int := 0;
  v_bytes bytea;
  v_value bigint;
  v_candidate text;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;

    IF v_attempt <= v_candidate_count THEN
      v_candidate := p_candidates[v_attempt];
    ELSIF v_attempt <= v_candidate_count + c_max_random_attempts THEN
      -- 5バイト（40ビット）を5ビットずつ8文字にする
      v_bytes := extensions.gen_random_bytes(5);
      v_value := 0;
      FOR i IN 0..4 LOOP
        v_value := (v_value << 8) | get_byte(v_bytes, i);
      END LOOP;
      v_candidate := '';
      FOR i IN REVERSE 7..0 LOOP
        v_candidate := v_candidate || substr(c_alphabet, ((v_value >> (5 * i)) & 31)::int + 1, 1);
      END LOOP;
    ELSE
      RAISE EXCEPTION 'generate_order_number: could not find an unused order number'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_candidate) THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."generate_order_number"(text[]) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."generate_order_number"(text[]) FROM PUBLIC;
