import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AdminMembershipRepository } from "@/repositories/admin-membership-repository";
import { AdminMembership } from "@/domain/entities/admin-membership";

type AdminMembershipRow = {
  id: string;
  admin_user_id: string;
  clerk_role: string;
  created_at: string;
  updated_at: string;
};

function toAdminMembership(row: AdminMembershipRow): AdminMembership {
  return AdminMembership.of({
    id: row.id,
    adminUserId: row.admin_user_id,
    clerkRole: row.clerk_role,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });
}

const SELECT_FIELDS = "id, admin_user_id, clerk_role, created_at, updated_at";

export class SupabaseAdminMembershipRepository implements AdminMembershipRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByAdminUserId(
    adminUserId: string
  ): Promise<AdminMembership | null> {
    const { data } = await this.db
      .from("admin_memberships")
      .select(SELECT_FIELDS)
      .eq("admin_user_id", adminUserId)
      .maybeSingle();
    return data ? toAdminMembership(data as AdminMembershipRow) : null;
  }

  async save(membership: AdminMembership): Promise<void> {
    await this.db.from("admin_memberships").upsert(
      {
        id: membership.id,
        admin_user_id: membership.adminUserId,
        clerk_role: membership.clerkRole,
      },
      { onConflict: "admin_user_id" }
    );
  }

  async deleteByAdminUserId(adminUserId: string): Promise<void> {
    await this.db
      .from("admin_memberships")
      .delete()
      .eq("admin_user_id", adminUserId);
  }
}
