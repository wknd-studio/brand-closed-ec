import { MemberRank } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

interface OrganizationProps {
  id: string;
  clerkOrgId: string;
  name: string;
  representativeName: string;
  phoneNumber: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  invoiceRegistrationNumber: string;
  onboardingCompleted: boolean;
  rank: MemberRank;
  billingAnchorDay: number | null;
  stripeCustomerId: string | null;
  initialFeePaidRank: MemberRank | null;
  deletedAt: Date | null;
}

export class Organization {
  readonly id: string;
  readonly clerkOrgId: string;
  readonly name: string;
  readonly representativeName: string;
  readonly phoneNumber: string;
  readonly postalCode: string;
  readonly prefecture: string;
  readonly city: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly invoiceRegistrationNumber: string;
  readonly onboardingCompleted: boolean;
  readonly rank: MemberRank;
  readonly billingAnchorDay: number | null;
  readonly stripeCustomerId: string | null;
  readonly initialFeePaidRank: MemberRank | null;
  readonly deletedAt: Date | null;

  private constructor(props: OrganizationProps) {
    this.id = props.id;
    this.clerkOrgId = props.clerkOrgId;
    this.name = props.name;
    this.representativeName = props.representativeName;
    this.phoneNumber = props.phoneNumber;
    this.postalCode = props.postalCode;
    this.prefecture = props.prefecture;
    this.city = props.city;
    this.addressLine1 = props.addressLine1;
    this.addressLine2 = props.addressLine2;
    this.invoiceRegistrationNumber = props.invoiceRegistrationNumber;
    this.onboardingCompleted = props.onboardingCompleted;
    this.rank = props.rank;
    this.billingAnchorDay = props.billingAnchorDay;
    this.stripeCustomerId = props.stripeCustomerId;
    this.initialFeePaidRank = props.initialFeePaidRank;
    this.deletedAt = props.deletedAt;
  }

  static of(props: OrganizationProps): Organization {
    return new Organization(props);
  }

  with(overrides: Partial<OrganizationProps>): Organization {
    return new Organization({ ...this.toProps(), ...overrides });
  }

  private toProps(): OrganizationProps {
    return {
      id: this.id,
      clerkOrgId: this.clerkOrgId,
      name: this.name,
      representativeName: this.representativeName,
      phoneNumber: this.phoneNumber,
      postalCode: this.postalCode,
      prefecture: this.prefecture,
      city: this.city,
      addressLine1: this.addressLine1,
      addressLine2: this.addressLine2,
      invoiceRegistrationNumber: this.invoiceRegistrationNumber,
      onboardingCompleted: this.onboardingCompleted,
      rank: this.rank,
      billingAnchorDay: this.billingAnchorDay,
      stripeCustomerId: this.stripeCustomerId,
      initialFeePaidRank: this.initialFeePaidRank,
      deletedAt: this.deletedAt,
    };
  }

  getMonthlyPeriod(now: Date = new Date()): MonthlyPeriod {
    return MonthlyPeriod.fromBillingAnchorDay(this.billingAnchorDay, now);
  }

  getMonthlyLimit(): Money {
    return this.rank.getMonthlyLimit();
  }

  isClosed(): boolean {
    return this.deletedAt !== null;
  }
}
