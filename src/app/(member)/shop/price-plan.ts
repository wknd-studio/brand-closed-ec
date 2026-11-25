import { PLANS } from "@/app/home-presenter";
import type { MemberRank } from "@/domain/value-objects/member-rank";

// 商品画面の価格がどのプランの会員価格か（例: 「STANDARD（標準）」）。プラン名は料金表（PLANS）と同じ出どころから出す
export function pricePlanLabel(rank: MemberRank): string {
  const plan = PLANS.find(({ id }) => id === rank.value)!;
  return `${plan.label}（${plan.name}）`;
}
