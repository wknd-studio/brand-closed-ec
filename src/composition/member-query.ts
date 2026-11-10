import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseMemberQueryService } from "@/infrastructure/supabase/supabase-member-query-service";
import type { MemberQueryService } from "@/queries/member-query-service";

// ログイン中の会員のトークンで RLS を効かせたクライアントを使う（Query Service の会員の絞り込みと二重に守る）
export async function memberQueryService(): Promise<MemberQueryService> {
  return new SupabaseMemberQueryService(await createServerClient());
}
