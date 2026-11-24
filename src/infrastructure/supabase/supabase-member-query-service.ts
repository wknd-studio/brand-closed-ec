import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  FavoritesDto,
  MemberLayoutDto,
  MemberQueryService,
  SettingsDto,
} from "@/queries/member-query-service";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";
import type { SubscriptionStatus } from "@/domain/value-objects/subscription-status";
import { isSubscriptionPaymentFailed } from "@/domain/services/new-order-eligibility";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";

export class SupabaseMemberQueryService implements MemberQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findSettings(clerkUserId: string): Promise<SettingsDto | null> {
    const { data, error } = await this.db
      .from("users")
      .select(
        "created_at, addresses(id, type, is_default, recipient_last_name, recipient_first_name, postal_code, prefecture, city, address_line1, address_line2, phone_number)"
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .order("is_default", { referencedTable: "addresses", ascending: false })
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    // 退会の判定（User.withdraw）と同じ最低利用期間の計算を使う
    const minimumPeriod = MinimumMembershipPeriod.startingAt(
      new Date(data.created_at)
    );

    return {
      withdrawableFrom: minimumPeriod.includes(new Date())
        ? minimumPeriod.withdrawableFrom.toISOString()
        : null,
      addresses: data.addresses.map((a) => ({
        id: a.id,
        type: a.type,
        isDefault: a.is_default,
        recipientLastName: a.recipient_last_name,
        recipientFirstName: a.recipient_first_name,
        postalCode: a.postal_code,
        prefecture: a.prefecture,
        city: a.city,
        addressLine1: a.address_line1,
        addressLine2: a.address_line2 ?? "",
        phoneNumber: a.phone_number,
      })),
    };
  }

  async findFavorites(clerkUserId: string): Promise<FavoritesDto | null> {
    const user = await this.findUserWithFavorites(clerkUserId);
    if (!user) return null;

    return {
      rank: user.rank,
      favoriteProductIds: user.favoriteProductIds,
    };
  }

  async findMemberLayout(clerkUserId: string): Promise<MemberLayoutDto | null> {
    const user = await this.findUserWithFavorites(clerkUserId);
    if (!user) return null;

    // 注文確定時の上限チェック（place_order_with_limit_check）と同じ集計ルールにするため、
    // 確定額は OrderRepository の集計をそのまま使う（#444）
    const confirmedAmount = await new SupabaseOrderRepository(
      this.db
    ).sumConfirmedAmountByUserId(
      user.id,
      MonthlyPeriod.fromBillingAnchorDay(user.billingAnchorDay)
    );

    return {
      confirmedAmount,
      monthlyLimit: user.monthlyLimit,
      favoriteProductIds: user.favoriteProductIds,
      paymentFailing: user.subscriptionStatuses.some((status) =>
        isSubscriptionPaymentFailed(status)
      ),
    };
  }

  async findOnboardingCompleted(clerkUserId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("users")
      .select("onboarding_completed")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;

    return data?.onboarding_completed ?? false;
  }

  async findStripeCustomerId(clerkUserId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("users")
      .select("stripe_customer_id")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;

    return data?.stripe_customer_id ?? null;
  }

  async findMemberRank(clerkUserId: string): Promise<MemberRank | null> {
    const { data, error } = await this.db
      .from("users")
      .select("rank_code")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return MemberRank.of(data.rank_code);
  }

  // レイアウトは画面のたびに読むため、サブスクリプションの状態も会員の行と1回のクエリでまとめて取る（#379）
  private async findUserWithFavorites(clerkUserId: string) {
    const { data, error } = await this.db
      .from("users")
      .select(
        "id, rank_code, billing_anchor_day, favorites(sanity_product_id), member_ranks!users_rank_code_fkey(monthly_limit_amount), subscriptions(status)"
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .order("created_at", { referencedTable: "favorites", ascending: false })
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      rank: MemberRank.of(data.rank_code),
      billingAnchorDay: data.billing_anchor_day,
      // 月間仕入れ上限の正は member_ranks（NULL = 無制限）。注文確定時の上限チェックと同じ値を使う
      monthlyLimit: data.member_ranks.monthly_limit_amount,
      favoriteProductIds: data.favorites.map((f) => f.sanity_product_id),
      // 解約済みの過去の契約も含む（解約済みは支払い失敗中にならない）
      // status の値は CHECK 制約で domain の SubscriptionStatus に限られる
      subscriptionStatuses: data.subscriptions.map(
        (s) => s.status as SubscriptionStatus
      ),
    };
  }
}
