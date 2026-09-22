interface AdminMembershipProps {
  id: string;
  adminUserId: string;
  clerkRole: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AdminMembership {
  readonly id: string;
  readonly adminUserId: string;
  readonly clerkRole: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AdminMembershipProps) {
    this.id = props.id;
    this.adminUserId = props.adminUserId;
    this.clerkRole = props.clerkRole;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static of(props: AdminMembershipProps): AdminMembership {
    return new AdminMembership(props);
  }
}
