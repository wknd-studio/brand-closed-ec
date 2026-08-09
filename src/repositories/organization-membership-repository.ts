import type { OrganizationMembership } from "@/domain/entities/organization-membership";

export interface OrganizationMembershipRepository {
  findByUserId(userId: string): Promise<OrganizationMembership[]>;
  findByOrganizationId(
    organizationId: string
  ): Promise<OrganizationMembership[]>;
  findByOrganizationAndUser(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMembership | null>;
  countAdmins(organizationId: string): Promise<number>;
  save(membership: OrganizationMembership): Promise<void>;
  delete(organizationId: string, userId: string): Promise<void>;
}
