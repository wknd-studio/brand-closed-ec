CREATE TABLE "public"."order_status_changes" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"                 uuid                     NOT NULL,
  "from_status"              text,
  "to_status"                text                     NOT NULL,
  "changed_by"               text                     NOT NULL,
  "changed_by_admin_user_id" uuid,
  "reason"                   text,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_status_changes_admin_user_check" CHECK (((changed_by = 'admin'::text) = (changed_by_admin_user_id IS NOT NULL))),
  CONSTRAINT "order_status_changes_changed_by_admin_user_id_fkey" FOREIGN KEY (changed_by_admin_user_id) REFERENCES public.admin_users(id),
  CONSTRAINT "order_status_changes_changed_by_check" CHECK ((changed_by = ANY (ARRAY['customer'::text, 'admin'::text, 'system'::text]))),
  CONSTRAINT "order_status_changes_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_status_changes_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

ALTER TABLE "public"."order_status_changes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX order_status_changes_order_id_idx ON public.order_status_changes USING btree (order_id);

CREATE TRIGGER order_status_changes_append_only
  BEFORE DELETE OR UPDATE ON public.order_status_changes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_status_changes_modification();

CREATE POLICY "order_status_changes: select own" ON "public"."order_status_changes"
  FOR SELECT
  TO PUBLIC
  USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.user_id = public.get_current_user_id()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_status_changes" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."order_status_changes" IS 'orders.status の変更の追記専用の来歴（issue #237）。UPDATE/DELETE はトリガーで拒否する（注文の削除に伴うカスケードだけは通す）。orders.status の更新は、必ずこのテーブルへの INSERT と同じトランザクションで行う（save_order・place_order_with_limit_check）。';
