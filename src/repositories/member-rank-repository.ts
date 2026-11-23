import type { MemberRank } from "@/domain/value-objects/member-rank";
import type { MonthlyLimit } from "@/domain/value-objects/monthly-limit";

// 会員ランクのマスタ（member_ranks）の読み取り
export interface MemberRankRepository {
  // ランクの月間仕入れ上限。金額の正は member_ranks.monthly_limit_amount（NULL = 無制限）
  findMonthlyLimit(rank: MemberRank): Promise<MonthlyLimit>;
}
