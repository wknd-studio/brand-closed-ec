import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { OrganizationMembershipRepository } from "@/repositories/organization-membership-repository";
import {
  OrganizationMembership,
  type ClerkRole,
} from "@/domain/entities/organization-membership";

type OrganizationMembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  clerk_role: string;
  created_at: string;
};

function toOrganizationMembership(
  row: OrganizationMembershipRow
): OrganizationMembership {
  return OrganizationMembership.of({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    clerkRole: row.clerk_role as ClerkRole,
    createdAt: new Date(row.created_at),
  });
}

const SELECT_FIELDS = "id, organization_id, user_id, clerk_role, created_at";

export class SupabaseOrganizationMembershipRepository implements OrganizationMembershipRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    const { data } = await this.db
      .from("organization_memberships")
      .select(SELECT_FIELDS)
      .eq("user_id", userId);
    return (data ?? []).map((row) =>
      toOrganizationMembership(row as OrganizationMembershipRow)
    );
  }

  async findByOrganizationId(
    organizationId: string
  ): Promise<OrganizationMembership[]> {
    const { data } = await this.db
      .from("organization_memberships")
      .select(SELECT_FIELDS)
      .eq("organization_id", organizationId);
    return (data ?? []).map((row) =>
      toOrganizationMembership(row as OrganizationMembershipRow)
    );
  }

  async findByOrganizationAndUser(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMembership | null> {
    const { data } = await this.db
      .from("organization_memberships")
      .select(SELECT_FIELDS)
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    return data
      ? toOrganizationMembership(data as OrganizationMembershipRow)
      : null;
  }

  async countAdmins(organizationId: string): Promise<number> {
    const { count } = await this.db
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("clerk_role", "org:admin");
    return count ?? 0;
  }

  async save(membership: OrganizationMembership): Promise<void> {
    await this.db.from("organization_memberships").upsert({
      id: membership.id,
      organization_id: membership.organizationId,
      user_id: membership.userId,
      clerk_role: membership.clerkRole,
    });
  }

  async delete(organizationId: string, userId: string): Promise<void> {
    await this.db
      .from("organization_memberships")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", userId);
  }
}
