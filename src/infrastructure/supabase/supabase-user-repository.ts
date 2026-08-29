import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserRepository } from "@/repositories/user-repository";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";

type UserRow = {
  id: string;
  clerk_user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  profile_completed_at: string | null;
  rank_code: string;
  billing_anchor_day: number | null;
  onboarding_completed: boolean;
  deleted_at: string | null;
  stripe_customer_id: string | null;
};

function toUser(row: UserRow): User {
  return User.of({
    id: row.id,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phoneNumber: row.phone_number,
    profileCompletedAt: row.profile_completed_at
      ? new Date(row.profile_completed_at)
      : null,
    rank: MemberRank.of(row.rank_code),
    billingAnchorDay: row.billing_anchor_day,
    onboardingCompleted: row.onboarding_completed,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    stripeCustomerId: row.stripe_customer_id,
  });
}

const SELECT_FIELDS =
  "id, clerk_user_id, email, first_name, last_name, phone_number, profile_completed_at, rank_code, billing_anchor_day, onboarding_completed, deleted_at, stripe_customer_id";

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByClerkUserId(clerkUserId: string): Promise<User | null> {
    const { data } = await this.db
      .from("users")
      .select(SELECT_FIELDS)
      .eq("clerk_user_id", clerkUserId)
      .single();
    return data ? toUser(data as UserRow) : null;
  }

  async findById(id: string): Promise<User | null> {
    const { data } = await this.db
      .from("users")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .single();
    return data ? toUser(data as UserRow) : null;
  }

  async save(user: User): Promise<void> {
    await this.db.from("users").upsert({
      id: user.id,
      clerk_user_id: user.clerkUserId,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      phone_number: user.phoneNumber,
      profile_completed_at: user.profileCompletedAt?.toISOString() ?? null,
      rank_code: user.rank.value,
      billing_anchor_day: user.billingAnchorDay,
      onboarding_completed: user.onboardingCompleted,
      deleted_at: user.deletedAt?.toISOString() ?? null,
      stripe_customer_id: user.stripeCustomerId,
    });
  }
}
