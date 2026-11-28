import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseProcurementTaskQueryService } from "@/infrastructure/supabase/supabase-procurement-task-query-service";
import type { ProcurementTaskQueryService } from "@/queries/procurement-task-query-service";

// 運営者の画面のため admin を使う（procurement_tasks には会員・運営者向けのポリシーが無い）。
// 権限は admin の layout で確かめる
export function procurementTaskQueryService(): ProcurementTaskQueryService {
  return new SupabaseProcurementTaskQueryService(createAdminClient());
}
