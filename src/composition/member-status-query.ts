import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseMemberStatusQueryService } from "@/infrastructure/supabase/supabase-member-status-query-service";
import type { MemberStatusQueryService } from "@/queries/member-status-query-service";

// middleware から使う。middleware では会員のトークンで RLS を効かせたクライアントを作らず、
// service_role のクライアントで Clerk の userId に絞って取る
export function memberStatusQueryService(): MemberStatusQueryService {
  return new SupabaseMemberStatusQueryService(createAdminClient());
}
