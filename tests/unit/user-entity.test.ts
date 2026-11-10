import { describe, it, expect } from "vitest";
import { User, reconstituteUser } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { MemberType } from "@/domain/value-objects/member-type";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import { InvoiceRegistrationNumber } from "@/domain/value-objects/invoice-registration-number";
import { MissingCorporateProfileError } from "@/domain/errors/missing-corporate-profile-error";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import { MemberWithdrawnError } from "@/domain/errors/member-withdrawn-error";
import { OnboardingAlreadyCompletedError } from "@/domain/errors/onboarding-already-completed-error";
import { makeOrder, makeOrderItem, makeSettlement } from "./use-cases/helpers";

function makeUser(
  overrides: Partial<Parameters<typeof reconstituteUser>[0]> = {}
) {
  return reconstituteUser({
    id: "user-001",
    clerkUserId: "clerk_abc123",
    email: "test@example.com",
    firstName: "太郎",
    lastName: "山田",
    phoneNumber: PhoneNumber.of("09012345678"),
    profileCompletedAt: new Date(2026, 0, 10),
    rank: MemberRank.of("basic"),
    billingAnchorDay: 10,
    onboardingCompleted: true,
    deletedAt: null,
    stripeCustomerId: null,
    ...overrides,
  });
}

describe("User", () => {
  describe("getMonthlyPeriod()", () => {
    it("billingAnchorDayを基準にした月次期間を返す", () => {
      const user = makeUser({ billingAnchorDay: 10 });
      const now = new Date(2026, 5, 15);
      const period = user.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 10));
      expect(period.end).toEqual(new Date(2026, 6, 10));
    });

    it("billingAnchorDayがnullのとき当月1日〜翌月1日", () => {
      const user = makeUser({ billingAnchorDay: null });
      const now = new Date(2026, 5, 15);
      const period = user.getMonthlyPeriod(now);
      expect(period.start).toEqual(new Date(2026, 5, 1));
      expect(period.end).toEqual(new Date(2026, 6, 1));
    });
  });

  describe("getMonthlyLimit()", () => {
    it("ランクに対応した月次上限 Money を返す", () => {
      const user = makeUser({ rank: MemberRank.of("standard") });
      expect(user.getMonthlyLimit().amount).toBe(5_000_000);
    });
  });

  describe("withdraw()", () => {
    const now = new Date(2026, 9, 24, 12, 0, 0);
    const unresolved = (status: "invoice_sent" | "limit_exceeded") =>
      makeOrder({ settlements: [makeSettlement({ status })] });
    const resolved = makeOrder({
      settlements: [makeSettlement({ status: "paid", paidAt: now })],
    });
    const beforePayment = makeOrder({
      settlements: [makeSettlement({ status: "pending_payment" })],
    });
    // 注文はキャンセル済みだが、決済単位の状態が未解決のまま残っている
    const cancelledWithUnresolved = makeOrder({
      status: "cancelled",
      settlements: [makeSettlement({ status: "invoice_sent" })],
    });

    it("注文が0件なら、deletedAt に退会日時を立てた User を返す", () => {
      const user = makeUser({ deletedAt: null });

      const withdrawn = user.withdraw([], now);

      expect(withdrawn.deletedAt).toEqual(now);
      expect(withdrawn.isWithdrawn()).toBe(true);
      expect(user.deletedAt).toBeNull();
    });

    it.each([
      ["請求済み未払い（invoice_sent）", "invoice_sent"],
      ["上限超過（limit_exceeded）", "limit_exceeded"],
    ] as const)(
      "キャンセルされていない注文に%sの決済単位があれば ActiveOrdersExistError をthrowする",
      (_, status) => {
        const user = makeUser({ deletedAt: null });

        expect(() => user.withdraw([unresolved(status)], now)).toThrow(
          ActiveOrdersExistError
        );
      }
    );

    it("未解決の決済単位を持たない注文（支払い済み・決済前・決済単位なし）だけなら退会できる", () => {
      const user = makeUser({ deletedAt: null });

      const withdrawn = user.withdraw(
        [
          resolved,
          beforePayment,
          makeOrder({
            items: [
              makeOrderItem({
                paymentTiming: "after_order",
                settlementId: null,
              }),
            ],
            settlements: [],
          }),
        ],
        now
      );

      expect(withdrawn.deletedAt).toEqual(now);
    });

    it("キャンセル済みの注文は、未解決の決済単位が残っていても退会を止めない", () => {
      const user = makeUser({ deletedAt: null });

      const withdrawn = user.withdraw([cancelledWithUnresolved], now);

      expect(withdrawn.deletedAt).toEqual(now);
    });

    it("退会を止めない注文に混ざって、未解決の決済単位を持つ注文が1件でもあれば ActiveOrdersExistError をthrowする", () => {
      const user = makeUser({ deletedAt: null });

      expect(() =>
        user.withdraw(
          [
            resolved,
            cancelledWithUnresolved,
            unresolved("limit_exceeded"),
            beforePayment,
          ],
          now
        )
      ).toThrow(ActiveOrdersExistError);
    });

    it("退会済みなら MemberWithdrawnError をthrowし、退会日時を上書きしない", () => {
      const withdrawnAt = new Date(2026, 0, 1);
      const user = makeUser({ deletedAt: withdrawnAt });

      expect(() => user.withdraw([], new Date(2026, 9, 24))).toThrow(
        MemberWithdrawnError
      );
      expect(user.deletedAt).toEqual(withdrawnAt);
    });
  });

  describe("cancelWithdrawal()", () => {
    it("退会を取り消し、deletedAt を null に戻した User を返す", () => {
      const withdrawn = makeUser({ deletedAt: null }).withdraw(
        [],
        new Date(2026, 9, 24)
      );

      const restored = withdrawn.cancelWithdrawal();

      expect(restored.deletedAt).toBeNull();
      expect(restored.isWithdrawn()).toBe(false);
      expect(withdrawn.isWithdrawn()).toBe(true);
    });
  });

  describe("isWithdrawn()", () => {
    it("deletedAt が null のとき false", () => {
      expect(makeUser({ deletedAt: null }).isWithdrawn()).toBe(false);
    });

    it("deletedAt が設定されているとき true", () => {
      expect(makeUser({ deletedAt: new Date(2026, 0, 1) }).isWithdrawn()).toBe(
        true
      );
    });
  });

  describe("hasCompletedProfile()", () => {
    it("氏名・電話番号がすべて入力済みのとき true", () => {
      expect(
        makeUser({
          firstName: "太郎",
          lastName: "山田",
          phoneNumber: PhoneNumber.of("09012345678"),
        }).hasCompletedProfile()
      ).toBe(true);
    });

    it("電話番号が未入力（null）のとき false", () => {
      expect(
        makeUser({
          firstName: "太郎",
          lastName: "山田",
          phoneNumber: null,
        }).hasCompletedProfile()
      ).toBe(false);
    });

    it("氏名が空のとき false", () => {
      expect(
        makeUser({
          firstName: "",
          lastName: "",
          phoneNumber: PhoneNumber.of("09012345678"),
        }).hasCompletedProfile()
      ).toBe(false);
    });
  });

  describe("hasCompletedOnboarding()", () => {
    it("onboardingCompleted が true のとき true", () => {
      expect(
        makeUser({ onboardingCompleted: true }).hasCompletedOnboarding()
      ).toBe(true);
    });

    it("onboardingCompleted が false のとき false", () => {
      expect(
        makeUser({ onboardingCompleted: false }).hasCompletedOnboarding()
      ).toBe(false);
    });
  });

  describe("memberType", () => {
    it("指定しない場合はindividualになる", () => {
      expect(makeUser().memberType.value).toBe("individual");
    });

    it("corporateにはcompanyName/invoiceRegistrationNumberが必須", () => {
      expect(() =>
        makeUser({
          memberType: MemberType.of("corporate"),
          companyName: null,
          invoiceRegistrationNumber: null,
        })
      ).toThrow(MissingCorporateProfileError);
    });

    it("companyName/invoiceRegistrationNumberを指定すればcorporateにできる", () => {
      const user = makeUser({
        memberType: MemberType.of("corporate"),
        companyName: "テスト株式会社",
        invoiceRegistrationNumber:
          InvoiceRegistrationNumber.of("T1234567890123"),
      });
      expect(user.memberType.value).toBe("corporate");
      expect(user.companyName).toBe("テスト株式会社");
      expect(user.invoiceRegistrationNumber?.value).toBe("T1234567890123");
    });
  });
});

describe("User の電話番号", () => {
  it("値オブジェクトで持つ", () => {
    const user = makeUser({ phoneNumber: PhoneNumber.of("090-1234-5678") });
    expect(user.phoneNumber?.value).toBe("09012345678");
  });
});

describe("User.initialFeePaidRank", () => {
  it("指定が無ければnull（初期費用を一度も支払っていない）", () => {
    expect(makeUser().initialFeePaidRank).toBeNull();
  });

  it("指定した支払い済み最高ランクを保持する", () => {
    const user = makeUser({ initialFeePaidRank: MemberRank.of("pro") });
    expect(user.initialFeePaidRank?.value).toBe("pro");
  });
});

describe("User.selectPlan()", () => {
  const individualApplication = {
    email: "new@example.com",
    firstName: "次郎",
    lastName: "佐藤",
    phoneNumber: PhoneNumber.of("08011112222"),
    rank: MemberRank.of("premium"),
    memberType: MemberType.of("individual"),
    companyName: null,
    invoiceRegistrationNumber: null,
  };

  function makeApplyingUser() {
    return makeUser({
      onboardingCompleted: false,
      stripeCustomerId: "cus_keep",
      billingAnchorDay: 15,
      initialFeePaidRank: MemberRank.of("basic"),
    });
  }

  it("未入会の会員のプラン選択の内容（連絡先・氏名・電話番号・ランク・会員種別）で更新する", () => {
    const user = makeApplyingUser();

    const selected = user.selectPlan(individualApplication);

    expect(selected.email).toBe("new@example.com");
    expect(selected.firstName).toBe("次郎");
    expect(selected.lastName).toBe("佐藤");
    expect(selected.phoneNumber?.value).toBe("08011112222");
    expect(selected.rank.value).toBe("premium");
    expect(selected.memberType.value).toBe("individual");
    expect(selected.onboardingCompleted).toBe(false);
    expect(user.rank.value).toBe("basic");
  });

  it("プラン選択と関係の無い項目（ID・Stripe Customer・請求基準日・支払い済み最高ランク等）は変えない", () => {
    const user = makeApplyingUser();

    const selected = user.selectPlan(individualApplication);

    expect(selected.id).toBe(user.id);
    expect(selected.clerkUserId).toBe(user.clerkUserId);
    expect(selected.stripeCustomerId).toBe("cus_keep");
    expect(selected.billingAnchorDay).toBe(15);
    expect(selected.profileCompletedAt).toEqual(user.profileCompletedAt);
    expect(selected.initialFeePaidRank?.value).toBe("basic");
    expect(selected.deletedAt).toBeNull();
  });

  it("法人として選択すると会社名・インボイス番号を持つ", () => {
    const selected = makeApplyingUser().selectPlan({
      ...individualApplication,
      memberType: MemberType.of("corporate"),
      companyName: "テスト株式会社",
      invoiceRegistrationNumber: InvoiceRegistrationNumber.of("T1234567890123"),
    });

    expect(selected.memberType.value).toBe("corporate");
    expect(selected.companyName).toBe("テスト株式会社");
    expect(selected.invoiceRegistrationNumber?.value).toBe("T1234567890123");
  });

  it("法人なのに会社名・インボイス番号が無ければ MissingCorporateProfileError をthrowする", () => {
    expect(() =>
      makeApplyingUser().selectPlan({
        ...individualApplication,
        memberType: MemberType.of("corporate"),
      })
    ).toThrow(MissingCorporateProfileError);
  });

  it("入会済みの会員は OnboardingAlreadyCompletedError をthrowする（ランク・会員種別を書き換えない）", () => {
    expect(() =>
      makeUser({ onboardingCompleted: true }).selectPlan(individualApplication)
    ).toThrow(OnboardingAlreadyCompletedError);
  });

  it("退会済みの会員は MemberWithdrawnError をthrowする", () => {
    expect(() =>
      makeUser({
        onboardingCompleted: false,
        deletedAt: new Date(2026, 9, 24),
      }).selectPlan(individualApplication)
    ).toThrow(MemberWithdrawnError);
  });
});

describe("User.register()", () => {
  const registered = () =>
    User.register({
      id: "user-new",
      clerkUserId: "clerk_new",
      email: "new@example.com",
      firstName: "次郎",
      lastName: "佐藤",
    });

  it("ID・Clerkのユーザー・連絡先・氏名を持つ会員を作る", () => {
    const user = registered();
    expect(user.id).toBe("user-new");
    expect(user.clerkUserId).toBe("clerk_new");
    expect(user.email).toBe("new@example.com");
    expect(user.firstName).toBe("次郎");
    expect(user.lastName).toBe("佐藤");
  });

  it("入会手続き前の初期状態（starter・個人・未入会・未退会・電話番号とStripe Customerと請求基準日なし）で作る", () => {
    const user = registered();
    expect(user.rank.value).toBe("starter");
    expect(user.memberType.value).toBe("individual");
    expect(user.onboardingCompleted).toBe(false);
    expect(user.deletedAt).toBeNull();
    expect(user.phoneNumber).toBeNull();
    expect(user.profileCompletedAt).toBeNull();
    expect(user.billingAnchorDay).toBeNull();
    expect(user.stripeCustomerId).toBeNull();
    expect(user.companyName).toBeNull();
    expect(user.invoiceRegistrationNumber).toBeNull();
    expect(user.initialFeePaidRank).toBeNull();
  });

  it("登録内容より広いオブジェクトが渡されても、初期状態の項目は上書きしない", () => {
    const user = User.register({
      id: "user-new",
      clerkUserId: "clerk_new",
      email: "new@example.com",
      firstName: "次郎",
      lastName: "佐藤",
      onboardingCompleted: true,
      rank: MemberRank.of("pro"),
    } as Parameters<typeof User.register>[0]);
    expect(user.onboardingCompleted).toBe(false);
    expect(user.rank.value).toBe("starter");
  });

  it("登録した会員はそのままプランを選択できる", () => {
    const selected = registered().selectPlan({
      email: "new@example.com",
      firstName: "次郎",
      lastName: "佐藤",
      phoneNumber: PhoneNumber.of("08011112222"),
      rank: MemberRank.of("premium"),
      memberType: MemberType.of("individual"),
      companyName: null,
      invoiceRegistrationNumber: null,
    });
    expect(selected.rank.value).toBe("premium");
    expect(selected.onboardingCompleted).toBe(false);
  });
});
