CREATE TABLE "public"."procurement_tasks" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "status"                 text                     NOT NULL DEFAULT 'pending'::text,
  "assigned_admin_user_id" uuid,
  "ordered_at"             timestamp with time zone,
  "notes"                  text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "procurement_tasks_assigned_admin_user_id_fkey" FOREIGN KEY (assigned_admin_user_id) REFERENCES public.admin_users(id),
  CONSTRAINT "procurement_tasks_pkey" PRIMARY KEY (id),
  CONSTRAINT "procurement_tasks_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'ordered'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."procurement_tasks"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER procurement_tasks_updated_at
  BEFORE UPDATE ON public.procurement_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."procurement_tasks" TO "authenticated", "postgres", "service_role";
