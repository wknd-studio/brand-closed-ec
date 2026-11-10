import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  MemberStatusDto,
  MemberStatusQueryService,
} from "@/queries/member-status-query-service";

export class SupabaseMemberStatusQueryService implements MemberStatusQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findMemberStatus(clerkUserId: string): Promise<MemberStatusDto | null> {
    // clerk_user_id の一意制約は deleted_at IS NULL の部分インデックスのため、退会済み行と
    // 有効な行が併存しうる。有効な行を優先し、無ければ退会済み行を取る
    const { data, error } = await this.db
      .from("users")
      .select("onboarding_completed, deleted_at")
      .eq("clerk_user_id", clerkUserId)
      .order("deleted_at", { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      onboardingCompleted: data.onboarding_completed,
      withdrawn: data.deleted_at !== null,
    };
  }
}
