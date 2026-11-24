-- ============================================================
-- orders.order_number: 重ならない注文番号（issue #754）
--
-- 今の注文番号は保存されておらず、画面に出すたびに注文ID（UUID）の先頭8文字から作っているため、
-- 重ならない保証が無い。注文番号を列として保存し、UNIQUE で重なりを防ぐ。
-- 形は Crockford Base32（0-9 と I・L・O・U を除く英大文字）の8文字（40ビット）で、ハイフンは
-- 付けずに保存する（ハイフンを付けた表示はアプリ側で行う）。
-- 注文を作るどの経路（place_order_with_limit_check・save_order・シードや E2E の直接の insert）も
-- 番号を指定しないため、列の DEFAULT で DB が入れる
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.orders
  ADD COLUMN order_number TEXT
    CONSTRAINT orders_order_number_key UNIQUE
    CONSTRAINT orders_order_number_format_check
      CHECK (order_number ~ '^[0-9A-HJKMNP-TV-Z]{8}$');

COMMENT ON COLUMN public.orders.order_number IS
  '注文番号（issue #754）。Crockford Base32 の8文字（ハイフン無し）。指定しなければ generate_order_number() が既存の注文と重ならない番号を入れる。';

-- ============================================================
-- generate_order_number: 既存の注文と重ならない注文番号を作る
--
-- 乱数（40ビット）から番号を作り、既存の注文と重なれば作り直す。
-- p_candidates はテストで重なりを人工的に起こすためのもので、乱数より先に先頭から試す
-- （列の DEFAULT からは渡さない）。
-- 同時に作った2つの注文がたまたま同じ番号を引いた場合は、後から確定した側が UNIQUE で失敗する
-- （2^40 通りのため、起きる見込みは無視できる）
-- ============================================================

CREATE FUNCTION public.generate_order_number(p_candidates text[] DEFAULT '{}')
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
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
$$;

-- 列の DEFAULT から呼ぶため、注文を作れるロール（service role）だけが実行できる。
-- 会員は orders に書き込めない（RLS）ため、実行できなくてよい
REVOKE ALL ON FUNCTION public.generate_order_number FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_order_number FROM anon, authenticated;

-- ============================================================
-- 既存の注文（local・stg）に番号を入れる
-- 1行ずつ入れ、前の行に入れた番号との重なりも generate_order_number が確かめられるようにする。
-- 注文の内容は変わらないため、updated_at は進めない
-- ============================================================

ALTER TABLE public.orders DISABLE TRIGGER orders_updated_at;

DO $$
DECLARE
  v_order_id uuid;
BEGIN
  FOR v_order_id IN SELECT id FROM public.orders WHERE order_number IS NULL ORDER BY created_at, id LOOP
    UPDATE public.orders
    SET order_number = public.generate_order_number()
    WHERE id = v_order_id;
  END LOOP;
END;
$$;

ALTER TABLE public.orders ENABLE TRIGGER orders_updated_at;

ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT public.generate_order_number(),
  ALTER COLUMN order_number SET NOT NULL;
