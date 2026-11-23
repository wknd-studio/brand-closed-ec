// 運営スタッフの権限判定。Clerk のセッションと Supabase のロールの両方を見るため、関数として infrastructure に置いて re-export する
export { requireAdminPermission } from "@/infrastructure/supabase/supabase-admin-authorization";
