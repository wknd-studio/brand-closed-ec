import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { AdminRole } from "@/domain/value-objects/admin-role";
import type { AdminRoleQueryService } from "@/queries/admin-role-query-service";

export class SupabaseAdminRoleQueryService implements AdminRoleQueryService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findRoleByClerkUserId(clerkUserId: string): Promise<AdminRole | null> {
    const { data, error } = await this.db
      .from("admin_role_assignments")
      .select("role, admin_users!inner(clerk_user_id)")
      .eq("admin_users.clerk_user_id", clerkUserId)
      .maybeSingle();
    if (error) throw error;
    return data ? AdminRole.parse(data.role) : null;
  }
}
