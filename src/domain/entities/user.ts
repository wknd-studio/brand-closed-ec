import { MemberRank } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

interface UserProps {
  id: string;
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profileCompletedAt: Date | null;
  rank: MemberRank;
  billingAnchorDay: number | null;
  onboardingCompleted: boolean;
  deletedAt: Date | null;
  stripeCustomerId: string | null;
}

export class User {
  readonly id: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber: string;
  readonly profileCompletedAt: Date | null;
  readonly rank: MemberRank;
  readonly billingAnchorDay: number | null;
  readonly onboardingCompleted: boolean;
  readonly deletedAt: Date | null;
  readonly stripeCustomerId: string | null;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.clerkUserId = props.clerkUserId;
    this.email = props.email;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.phoneNumber = props.phoneNumber;
    this.profileCompletedAt = props.profileCompletedAt;
    this.rank = props.rank;
    this.billingAnchorDay = props.billingAnchorDay;
    this.onboardingCompleted = props.onboardingCompleted;
    this.deletedAt = props.deletedAt;
    this.stripeCustomerId = props.stripeCustomerId;
  }

  static of(props: UserProps): User {
    return new User(props);
  }

  with(overrides: Partial<UserProps>): User {
    return new User({ ...this.toProps(), ...overrides });
  }

  private toProps(): UserProps {
    return {
      id: this.id,
      clerkUserId: this.clerkUserId,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      phoneNumber: this.phoneNumber,
      profileCompletedAt: this.profileCompletedAt,
      rank: this.rank,
      billingAnchorDay: this.billingAnchorDay,
      onboardingCompleted: this.onboardingCompleted,
      deletedAt: this.deletedAt,
      stripeCustomerId: this.stripeCustomerId,
    };
  }

  getMonthlyPeriod(now: Date = new Date()): MonthlyPeriod {
    return MonthlyPeriod.fromBillingAnchorDay(this.billingAnchorDay, now);
  }

  getMonthlyLimit(): Money {
    return this.rank.getMonthlyLimit();
  }

  isWithdrawn(): boolean {
    return this.deletedAt !== null;
  }

  hasCompletedOnboarding(): boolean {
    return this.onboardingCompleted;
  }

  hasCompletedProfile(): boolean {
    return (
      this.firstName !== "" && this.lastName !== "" && this.phoneNumber !== ""
    );
  }
}
