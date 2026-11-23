import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { MemberRankRepository } from "@/repositories/member-rank-repository";
import type { MemberRank } from "@/domain/value-objects/member-rank";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";

export class SupabaseMemberRankRepository implements MemberRankRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findMonthlyLimit(rank: MemberRank): Promise<MonthlyLimit> {
    // users.rank_code は member_ranks への外部キーのため、会員のランクの行は必ずある
    const { data, error } = await this.db
      .from("member_ranks")
      .select("monthly_limit_amount")
      .eq("code", rank.value)
      .single();
    if (error) throw error;

    return MonthlyLimit.fromNullable(data.monthly_limit_amount);
  }
}
