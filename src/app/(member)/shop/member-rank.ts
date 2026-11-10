import { memberQueryService } from "@/composition/member-query";
import type { MemberRank } from "@/domain/value-objects/member-rank";

// 商品画面の価格を決める会員のランク。会員の行が見つからない（退会済み・同期の遅れ等）のは異常な状態なので、
// starter の価格で見せずにエラーにする（#602）。投げた例外は onRequestError で Sentry に送られる
export async function findShopMemberRank(
  clerkUserId: string
): Promise<MemberRank> {
  const rank = await (await memberQueryService()).findMemberRank(clerkUserId);
  if (!rank) throw new Error("商品画面の会員が見つかりません");
  return rank;
}
