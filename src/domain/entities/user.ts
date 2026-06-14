import { MemberRank } from "@/domain/value-objects/member-rank";
import { Money } from "@/domain/value-objects/money";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

interface UserProps {
  id: string;
  clerkUserId: string;
  email: string;
  rank: MemberRank;
  subscribedAt: Date | null;
  onboardingCompleted: boolean;
  termsAgreedAt: Date | null;
  termsVersion: string | null;
  deletedAt: Date | null;
}

export class User {
  readonly id: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly rank: MemberRank;
  readonly subscribedAt: Date | null;
  readonly onboardingCompleted: boolean;
  readonly termsAgreedAt: Date | null;
  readonly termsVersion: string | null;
  readonly deletedAt: Date | null;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.clerkUserId = props.clerkUserId;
    this.email = props.email;
    this.rank = props.rank;
    this.subscribedAt = props.subscribedAt;
    this.onboardingCompleted = props.onboardingCompleted;
    this.termsAgreedAt = props.termsAgreedAt;
    this.termsVersion = props.termsVersion;
    this.deletedAt = props.deletedAt;
  }

  static of(props: UserProps): User {
    return new User(props);
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
}
