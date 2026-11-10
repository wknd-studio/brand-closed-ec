import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseMemberOrderQueryService } from "@/infrastructure/supabase/supabase-member-order-query-service";
import type { MemberOrderQueryService } from "@/queries/member-order-query-service";

// ログイン中の会員のトークンで RLS を効かせたクライアントを使う（Query Service の会員の絞り込みと二重に守る）
export async function memberOrderQueryService(): Promise<MemberOrderQueryService> {
  return new SupabaseMemberOrderQueryService(await createServerClient());
}
