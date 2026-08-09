export interface OrganizationGateway {
  createOrganization(params: {
    name: string;
    createdByClerkUserId: string;
  }): Promise<{ clerkOrgId: string }>;

  inviteMember(params: {
    clerkOrgId: string;
    inviterClerkUserId: string;
    inviteeEmail: string;
  }): Promise<void>;

  deleteOrganization(clerkOrgId: string): Promise<void>;
}
