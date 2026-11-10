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
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";

export class SupabaseMemberQueryService implements MemberQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findSettings(clerkUserId: string): Promise<SettingsDto | null> {
    const { data, error } = await this.db
      .from("users")
      .select(
        "addresses(id, type, is_default, recipient_last_name, recipient_first_name, postal_code, prefecture, city, address_line1, address_line2, phone_number)"
      )
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .order("is_default", { referencedTable: "addresses", ascending: false })
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
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
      monthlyLimit: user.rank.getMonthlyLimit().amount,
      favoriteProductIds: user.favoriteProductIds,
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

  private async findUserWithFavorites(clerkUserId: string) {
    const { data, error } = await this.db
      .from("users")
      .select("id, rank_code, billing_anchor_day, favorites(sanity_product_id)")
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
      favoriteProductIds: data.favorites.map((f) => f.sanity_product_id),
    };
  }
}
