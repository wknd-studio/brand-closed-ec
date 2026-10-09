import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AdminUserRepository } from "@/repositories/admin-user-repository";
import { AdminUser } from "@/domain/entities/admin-user";

type AdminUserRow = {
  id: string;
  clerk_user_id: string;
  name: string;
  email: string;
  created_at: string;
};

function toAdminUser(row: AdminUserRow): AdminUser {
  return AdminUser.of({
    id: row.id,
    clerkUserId: row.clerk_user_id,
    name: row.name,
    email: row.email,
    createdAt: new Date(row.created_at),
  });
}

const SELECT_FIELDS = "id, clerk_user_id, name, email, created_at";

export class SupabaseAdminUserRepository implements AdminUserRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByClerkUserId(clerkUserId: string): Promise<AdminUser | null> {
    const { data } = await this.db
      .from("admin_users")
      .select(SELECT_FIELDS)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    return data ? toAdminUser(data as AdminUserRow) : null;
  }

  async save(adminUser: AdminUser): Promise<void> {
    await this.db.from("admin_users").upsert({
      id: adminUser.id,
      clerk_user_id: adminUser.clerkUserId,
      name: adminUser.name,
      email: adminUser.email,
    });
  }
}
