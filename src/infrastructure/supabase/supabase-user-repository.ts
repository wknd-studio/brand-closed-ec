import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserRepository } from "@/repositories/user-repository";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { MemberType } from "@/domain/value-objects/member-type";

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
  member_type: string;
  company_name: string | null;
  invoice_registration_number: string | null;
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
    memberType: MemberType.of(row.member_type),
    companyName: row.company_name,
    invoiceRegistrationNumber: row.invoice_registration_number,
  });
}

const SELECT_FIELDS =
  "id, clerk_user_id, email, first_name, last_name, phone_number, profile_completed_at, rank_code, billing_anchor_day, onboarding_completed, deleted_at, stripe_customer_id, member_type, company_name, invoice_registration_number";

// 部分UNIQUE（WHERE deleted_at IS NULL）。supabase-jsのonConflictは部分インデックスの
// 述語を書けないため、一意制約違反（23505）をこのインデックス名で判別する
const ACTIVE_CLERK_USER_ID_INDEX = "users_clerk_user_id_active_idx";

function isActiveClerkUserIdConflict(error: PostgrestError): boolean {
  return (
    error.code === "23505" && error.message.includes(ACTIVE_CLERK_USER_ID_INDEX)
  );
}

// id以外の列。既存の有効な行を更新するときはidを変えない
function toFields(user: User) {
  return {
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
    member_type: user.memberType.value,
    company_name: user.companyName,
    invoice_registration_number: user.invoiceRegistrationNumber,
  };
}

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByClerkUserId(clerkUserId: string): Promise<User | null> {
    // 部分UNIQUEのため、同じclerk_user_idの退会済み行と有効な行が併存しうる
    const { data, error } = await this.db
      .from("users")
      .select(SELECT_FIELDS)
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data ? toUser(data as UserRow) : null;
  }

  async hasWithdrawnByClerkUserId(clerkUserId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("clerk_user_id", clerkUserId)
      .not("deleted_at", "is", null);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async findById(id: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("users")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toUser(data as UserRow) : null;
  }

  async save(user: User): Promise<void> {
    const fields = toFields(user);
    const { error } = await this.db
      .from("users")
      .upsert({ id: user.id, ...fields });
    if (!error) return;
    if (!isActiveClerkUserIdConflict(error)) throw error;

    // user.created Webhookが先に別のidで行を作っていた場合は、その有効な行を更新する
    const { data, error: updateError } = await this.db
      .from("users")
      .update(fields)
      .eq("clerk_user_id", user.clerkUserId)
      .is("deleted_at", null)
      .select("id");
    if (updateError) throw updateError;
    // 衝突相手がその間に退会した場合など、入力内容がどこにも保存されないまま成功扱いにしない
    if (data.length === 0) {
      throw new Error(
        `users の保存に失敗しました（clerk_user_id=${user.clerkUserId} の有効な行が見つかりません）`
      );
    }
  }

  async saveStripeCustomerId(
    userId: string,
    stripeCustomerId: string
  ): Promise<void> {
    const { data, error } = await this.db
      .from("users")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", userId)
      .is("deleted_at", null)
      .select("id");
    if (error) throw error;
    if (data.length === 0) {
      throw new Error(
        `stripe_customer_id の保存に失敗しました（id=${userId} の有効な行が見つかりません）`
      );
    }
  }

  async insertIfAbsent(user: User): Promise<void> {
    const { error } = await this.db
      .from("users")
      .insert({ id: user.id, ...toFields(user) });
    if (error && !isActiveClerkUserIdConflict(error)) throw error;
  }
}
