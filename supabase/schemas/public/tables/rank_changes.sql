CREATE TABLE "public"."rank_changes" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "from_rank_code"         text,
  "to_rank_code"           text                     NOT NULL,
  "changed_by"             text                     NOT NULL,
  "initial_fee_charged"    boolean                  NOT NULL DEFAULT false,
  "stripe_subscription_id" text,
  "reason"                 text,
  "effective_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rank_changes_changed_by_check" CHECK ((changed_by = ANY (ARRAY['member'::text, 'admin'::text, 'system'::text]))),
  CONSTRAINT "rank_changes_from_rank_code_fkey" FOREIGN KEY (from_rank_code) REFERENCES public.member_ranks(code),
  CONSTRAINT "rank_changes_pkey" PRIMARY KEY (id),
  CONSTRAINT "rank_changes_to_rank_code_fkey" FOREIGN KEY (to_rank_code) REFERENCES public.member_ranks(code),
  CONSTRAINT "rank_changes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id)
);

ALTER TABLE "public"."rank_changes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX rank_changes_user_id_idx ON public.rank_changes USING btree (user_id);

CREATE POLICY "rank_changes: select own" ON "public"."rank_changes"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = public.get_current_user_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rank_changes" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."rank_changes" IS 'ランク変更の追記専用来歴。UPDATE/DELETEは行わない（訂正は打ち消し行の追加で表現する）。users.rank_code/organizations.rank_codeの更新は、必ず対応するこのテーブルへのINSERTと同一トランザクションで行う。';
