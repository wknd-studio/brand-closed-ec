import type { User } from "@/domain/entities/user";
import type { UserRepository } from "@/repositories/user-repository";
import type { SelfServiceRankValue } from "@/domain/value-objects/member-rank";

export type ResolveOnboardingCheckoutResult =
  | { user: User; rank: SelfServiceRankValue }
  | { redirectTo: string };

export type ResolveOnboardingCheckoutDeps = {
  userRepo: UserRepository;
};

const RESTART_ONBOARDING = { redirectTo: "/onboarding/account-type" };

/**
 * 入会時の決済で請求するランクを、URLのクエリではなくselectPlanで
 * DBに保存した登録内容から決める（GitHub issue #406）。URLを信じると、
 * プラン選択を飛ばして氏名・電話番号が空のまま決済したり、保存した
 * ランクと異なるランクで決済したりできてしまうため
 */
export async function resolveOnboardingCheckout(
  clerkUserId: string,
  deps: ResolveOnboardingCheckoutDeps
): Promise<ResolveOnboardingCheckoutResult> {
  const user = await deps.userRepo.findByClerkUserId(clerkUserId);
  if (!user || !user.hasCompletedProfile()) return RESTART_ONBOARDING;
  if (user.memberType.isCorporate() && !user.companyName) {
    return RESTART_ONBOARDING;
  }

  const { rank } = user;
  if (!rank.isSelfService()) return RESTART_ONBOARDING;

  return { user, rank: rank.value };
}
