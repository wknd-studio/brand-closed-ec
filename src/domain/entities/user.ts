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
  subscribedAt: Date | null;
  onboardingCompleted: boolean;
  termsAgreedAt: Date | null;
  termsVersion: string | null;
  deletedAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
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
  readonly subscribedAt: Date | null;
  readonly onboardingCompleted: boolean;
  readonly termsAgreedAt: Date | null;
  readonly termsVersion: string | null;
  readonly deletedAt: Date | null;
  readonly stripeCustomerId: string | null;
  readonly stripeSubscriptionId: string | null;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.clerkUserId = props.clerkUserId;
    this.email = props.email;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.phoneNumber = props.phoneNumber;
    this.profileCompletedAt = props.profileCompletedAt;
    this.rank = props.rank;
    this.subscribedAt = props.subscribedAt;
    this.onboardingCompleted = props.onboardingCompleted;
    this.termsAgreedAt = props.termsAgreedAt;
    this.termsVersion = props.termsVersion;
    this.deletedAt = props.deletedAt;
    this.stripeCustomerId = props.stripeCustomerId;
    this.stripeSubscriptionId = props.stripeSubscriptionId;
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
      subscribedAt: this.subscribedAt,
      onboardingCompleted: this.onboardingCompleted,
      termsAgreedAt: this.termsAgreedAt,
      termsVersion: this.termsVersion,
      deletedAt: this.deletedAt,
      stripeCustomerId: this.stripeCustomerId,
      stripeSubscriptionId: this.stripeSubscriptionId,
    };
  }

  getMonthlyPeriod(now: Date = new Date()): MonthlyPeriod {
    return MonthlyPeriod.fromSubscribedAt(this.subscribedAt, now);
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
