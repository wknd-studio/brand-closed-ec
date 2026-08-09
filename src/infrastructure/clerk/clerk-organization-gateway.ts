import { clerkClient } from "@clerk/nextjs/server";
import type { OrganizationGateway } from "@/repositories/organization-gateway";

export class ClerkOrganizationGateway implements OrganizationGateway {
  async createOrganization(params: {
    name: string;
    createdByClerkUserId: string;
  }): Promise<{ clerkOrgId: string }> {
    const clerk = await clerkClient();
    const organization = await clerk.organizations.createOrganization({
      name: params.name,
      createdBy: params.createdByClerkUserId,
    });
    return { clerkOrgId: organization.id };
  }

  async inviteMember(params: {
    clerkOrgId: string;
    inviterClerkUserId: string;
    inviteeEmail: string;
  }): Promise<void> {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId: params.clerkOrgId,
      emailAddress: params.inviteeEmail,
      role: "org:member",
      inviterUserId: params.inviterClerkUserId,
    });
  }

  async deleteOrganization(clerkOrgId: string): Promise<void> {
    const clerk = await clerkClient();
    await clerk.organizations.deleteOrganization(clerkOrgId);
  }
}
