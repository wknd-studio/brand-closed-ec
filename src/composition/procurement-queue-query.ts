import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { findBrandNamesByProductIds } from "@/infrastructure/sanity/sanity-product-brand-lookup";
import { SupabaseProcurementQueueQueryService } from "@/infrastructure/supabase/supabase-procurement-queue-query-service";
import type { ProcurementQueueQueryService } from "@/queries/procurement-queue-query-service";

// 運営者の画面のため admin を使う（運営者は users の行を持たず、会員向けのポリシーでは他の会員の明細が見えない）。
// 権限は admin の layout で確かめる
export function procurementQueueQueryService(): ProcurementQueueQueryService {
  return new SupabaseProcurementQueueQueryService(
    createAdminClient(),
    findBrandNamesByProductIds
  );
}
