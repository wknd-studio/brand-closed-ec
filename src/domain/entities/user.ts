import { MemberRank } from "@/domain/value-objects/member-rank";
import { MemberType } from "@/domain/value-objects/member-type";
import { Money } from "@/domain/value-objects/money";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { PhoneNumber } from "@/domain/value-objects/phone-number";
import type { InvoiceRegistrationNumber } from "@/domain/value-objects/invoice-registration-number";
import { MissingCorporateProfileError } from "@/domain/errors/missing-corporate-profile-error";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import { MemberWithdrawnError } from "@/domain/errors/member-withdrawn-error";
import { OnboardingAlreadyCompletedError } from "@/domain/errors/onboarding-already-completed-error";
import type { Order } from "./order";

interface UserProps {
  id: string;
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  // プロフィール未入力ならnull
  phoneNumber: PhoneNumber | null;
  profileCompletedAt: Date | null;
  rank: MemberRank;
  billingAnchorDay: number | null;
  onboardingCompleted: boolean;
  deletedAt: Date | null;
  stripeCustomerId: string | null;
  memberType?: MemberType;
  companyName?: string | null;
  invoiceRegistrationNumber?: InvoiceRegistrationNumber | null;
  initialFeePaidRank?: MemberRank | null;
}

/** プラン選択の申込内容（入会手続き中に会員が入力する項目） */
export interface PlanApplication {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: PhoneNumber;
  rank: MemberRank;
  memberType: MemberType;
  companyName: string | null;
  invoiceRegistrationNumber: InvoiceRegistrationNumber | null;
}

export class User {
  readonly id: string;
  readonly clerkUserId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber: PhoneNumber | null;
  readonly profileCompletedAt: Date | null;
  readonly rank: MemberRank;
  readonly billingAnchorDay: number | null;
  readonly onboardingCompleted: boolean;
  readonly deletedAt: Date | null;
  readonly stripeCustomerId: string | null;
  readonly memberType: MemberType;
  readonly companyName: string | null;
  readonly invoiceRegistrationNumber: InvoiceRegistrationNumber | null;
  // 支払い済み最高ランク。再入会・アップグレード時の初期費用の判定に使う
  readonly initialFeePaidRank: MemberRank | null;

  private constructor(props: UserProps) {
    const memberType = props.memberType ?? MemberType.of("individual");
    const companyName = props.companyName ?? null;
    const invoiceRegistrationNumber = props.invoiceRegistrationNumber ?? null;
    if (
      memberType.isCorporate() &&
      (!companyName || !invoiceRegistrationNumber)
    ) {
      throw new MissingCorporateProfileError();
    }
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
    this.memberType = memberType;
    this.companyName = companyName;
    this.invoiceRegistrationNumber = invoiceRegistrationNumber;
    this.initialFeePaidRank = props.initialFeePaidRank ?? null;
  }

  static of(props: UserProps): User {
    return new User(props);
  }

  private with(overrides: Partial<UserProps>): User {
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
      memberType: this.memberType,
      companyName: this.companyName,
      invoiceRegistrationNumber: this.invoiceRegistrationNumber,
      initialFeePaidRank: this.initialFeePaidRank,
    };
  }

  getMonthlyPeriod(now: Date = new Date()): MonthlyPeriod {
    return MonthlyPeriod.fromBillingAnchorDay(this.billingAnchorDay, now);
  }

  getMonthlyLimit(): Money {
    return this.rank.getMonthlyLimit();
  }

  // 入会手続き中（未入会）の会員がプラン選択をやり直したときに、申込内容で書き換える。
  // 入会済みの会員のランク・会員種別はここでは変えない（決済でサブスクリプションが二重にできるため）。
  // 法人の会社名・インボイス番号の必須はコンストラクタが検査する
  selectPlan(application: PlanApplication): User {
    if (this.isWithdrawn()) throw new MemberWithdrawnError();
    if (this.hasCompletedOnboarding()) {
      throw new OnboardingAlreadyCompletedError();
    }
    // 構造的部分型でより広いオブジェクトが渡されても、申込内容以外を上書きしないよう項目を取り出す
    return this.with({
      email: application.email,
      firstName: application.firstName,
      lastName: application.lastName,
      phoneNumber: application.phoneNumber,
      rank: application.rank,
      memberType: application.memberType,
      companyName: application.companyName,
      invoiceRegistrationNumber: application.invoiceRegistrationNumber,
    });
  }

  // 退会済み、またはキャンセルされていない注文のうち未解決の決済単位を持つものが
  // 1件でもあれば退会できない（docs/domain/membership.md）。orders は会員の全注文
  withdraw(orders: readonly Order[], now: Date = new Date()): User {
    if (this.isWithdrawn()) throw new MemberWithdrawnError();
    if (
      orders.some(
        (order) => !order.isCancelled() && order.hasUnresolvedSettlement()
      )
    ) {
      throw new ActiveOrdersExistError();
    }
    return this.with({ deletedAt: now });
  }

  // 退会処理の途中で失敗したときの取り消し（補償処理）。退会前の状態に戻す
  cancelWithdrawal(): User {
    return this.with({ deletedAt: null });
  }

  isWithdrawn(): boolean {
    return this.deletedAt !== null;
  }

  hasCompletedOnboarding(): boolean {
    return this.onboardingCompleted;
  }

  hasCompletedProfile(): boolean {
    return (
      this.firstName !== "" && this.lastName !== "" && this.phoneNumber !== null
    );
  }
}
