interface AdminUserProps {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
  createdAt: Date;
}

export class AdminUser {
  readonly id: string;
  readonly clerkUserId: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;

  private constructor(props: AdminUserProps) {
    this.id = props.id;
    this.clerkUserId = props.clerkUserId;
    this.name = props.name;
    this.email = props.email;
    this.createdAt = props.createdAt;
  }

  static of(props: AdminUserProps): AdminUser {
    return new AdminUser(props);
  }
}
