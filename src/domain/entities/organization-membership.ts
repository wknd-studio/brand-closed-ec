export const CLERK_ROLE_VALUES = ["org:admin", "org:member"] as const;
export type ClerkRole = (typeof CLERK_ROLE_VALUES)[number];

interface OrganizationMembershipProps {
  id: string;
  organizationId: string;
  userId: string;
  clerkRole: ClerkRole;
  createdAt: Date;
}

export class OrganizationMembership {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly clerkRole: ClerkRole;
  readonly createdAt: Date;

  private constructor(props: OrganizationMembershipProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.userId = props.userId;
    this.clerkRole = props.clerkRole;
    this.createdAt = props.createdAt;
  }

  static of(props: OrganizationMembershipProps): OrganizationMembership {
    return new OrganizationMembership(props);
  }

  isAdmin(): boolean {
    return this.clerkRole === "org:admin";
  }
}
