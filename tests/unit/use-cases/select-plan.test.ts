import { describe, it, expect, vi } from "vitest";
import { selectPlan } from "@/use-cases/select-plan";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
import { OnboardingAlreadyCompletedError } from "@/domain/errors/onboarding-already-completed-error";
import { MemberWithdrawnError } from "@/domain/errors/member-withdrawn-error";
import { MissingRequiredProfileFieldsError } from "@/domain/errors/missing-required-profile-fields-error";
import { makeUserRepo, makeAccountGateway, makeUser } from "./helpers";

const baseInput = {
  clerkUserId: "clerk-1",
  email: "test@example.com",
  firstName: "太郎",
  lastName: "山田",
  phoneNumber: "09012345678",
};

describe("selectPlan", () => {
  it("プランを選択した場合: onboarding_completed=false で /onboarding/payment にリダイレクト", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    const result = await selectPlan(
      { ...baseInput, plan: "starter" },
      { userRepo, accountGateway }
    );

    expect(result).toEqual({ redirectTo: "/onboarding/payment" });
    const saved = vi.mocked(userRepo.saveIfNotOnboarded).mock.calls[0][0];
    expect(saved.rank.value).toBe("starter");
    expect(saved.onboardingCompleted).toBe(false);
    expect(saved.firstName).toBe("太郎");
    expect(saved.lastName).toBe("山田");
    expect(saved.phoneNumber).toBe("09012345678");
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      false
    );
  });

  it("既存userが存在する場合: rank・氏名・電話番号を上書きして保存する", async () => {
    const existingUser = makeUser({
      rank: "starter",
      onboardingCompleted: false,
    });
    const userRepo = makeUserRepo(existingUser);
    const accountGateway = makeAccountGateway();

    await selectPlan(
      { ...baseInput, plan: "standard" },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.saveIfNotOnboarded).mock.calls[0][0];
    expect(saved.id).toBe(existingUser.id);
    expect(saved.rank.value).toBe("standard");
    expect(saved.firstName).toBe("太郎");
    expect(saved.lastName).toBe("山田");
    expect(saved.phoneNumber).toBe("09012345678");
  });

  it("電話番号の形式が不正な場合はInvalidPhoneNumberErrorをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    await expect(
      selectPlan(
        { ...baseInput, plan: "starter", phoneNumber: "12345" },
        { userRepo, accountGateway }
      )
    ).rejects.toThrow(InvalidPhoneNumberError);
  });

  it("companyName/invoiceRegistrationNumberが指定された場合: memberType=corporateで保存する", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    await selectPlan(
      {
        ...baseInput,
        plan: "advanced",
        companyName: "テスト株式会社",
        invoiceRegistrationNumber: "T1234567890123",
      },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.saveIfNotOnboarded).mock.calls[0][0];
    expect(saved.memberType.value).toBe("corporate");
    expect(saved.companyName).toBe("テスト株式会社");
    expect(saved.invoiceRegistrationNumber).toBe("T1234567890123");
  });

  it("companyName/invoiceRegistrationNumberが指定されない場合: memberType=individualで保存する", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    await selectPlan(
      { ...baseInput, plan: "starter" },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.saveIfNotOnboarded).mock.calls[0][0];
    expect(saved.memberType.value).toBe("individual");
    expect(saved.companyName).toBeNull();
    expect(saved.invoiceRegistrationNumber).toBeNull();
  });

  it("不正な形式のインボイス番号はInvalidInvoiceRegistrationNumberErrorをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    await expect(
      selectPlan(
        {
          ...baseInput,
          plan: "advanced",
          companyName: "テスト株式会社",
          invoiceRegistrationNumber: "invalid",
        },
        { userRepo, accountGateway }
      )
    ).rejects.toThrow(InvalidInvoiceRegistrationNumberError);
  });

  it("入会済みの会員からの送信はOnboardingAlreadyCompletedErrorをthrowし、DBとClerkのmetadataを変更しない", async () => {
    const userRepo = makeUserRepo(makeUser({ onboardingCompleted: true }));
    const accountGateway = makeAccountGateway();

    await expect(
      selectPlan(
        { ...baseInput, plan: "standard" },
        { userRepo, accountGateway }
      )
    ).rejects.toThrow(OnboardingAlreadyCompletedError);
    expect(userRepo.saveIfNotOnboarded).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });

  it("確認の後に入会済みに変わり保存されなかった場合はOnboardingAlreadyCompletedErrorをthrowし、Clerkのmetadataを変更しない", async () => {
    const userRepo = makeUserRepo(makeUser({ onboardingCompleted: false }));
    vi.mocked(userRepo.saveIfNotOnboarded).mockResolvedValue(false);
    const accountGateway = makeAccountGateway();

    await expect(
      selectPlan(
        { ...baseInput, plan: "standard" },
        { userRepo, accountGateway }
      )
    ).rejects.toThrow(OnboardingAlreadyCompletedError);
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });

  it("退会済みの会員（有効な行が無く退会済み行がある）からの送信はMemberWithdrawnErrorをthrowし、DBとClerkのmetadataを変更しない", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    vi.mocked(userRepo.hasWithdrawnByClerkUserId).mockResolvedValue(true);
    const accountGateway = makeAccountGateway();

    await expect(
      selectPlan(
        { ...baseInput, plan: "standard" },
        { userRepo, accountGateway }
      )
    ).rejects.toThrow(MemberWithdrawnError);
    expect(userRepo.hasWithdrawnByClerkUserId).toHaveBeenCalledWith("clerk-1");
    expect(userRepo.saveIfNotOnboarded).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });

  it("有効な行がある場合は退会済み行の有無を問わず有効な行で判定する", async () => {
    const userRepo = makeUserRepo(makeUser({ onboardingCompleted: false }));
    vi.mocked(userRepo.hasWithdrawnByClerkUserId).mockResolvedValue(true);
    const accountGateway = makeAccountGateway();

    await selectPlan(
      { ...baseInput, plan: "standard" },
      { userRepo, accountGateway }
    );

    expect(userRepo.saveIfNotOnboarded).toHaveBeenCalled();
  });

  describe("必須項目のサーバー側検証", () => {
    it.each([
      ["空", ""],
      ["空白だけ", " \u3000 "],
    ])(
      "姓・名が%sの場合はMissingRequiredProfileFieldsErrorをthrowし、保存しない",
      async (_, blank) => {
        const userRepo = makeUserRepo();
        vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
        const accountGateway = makeAccountGateway();

        const promise = selectPlan(
          { ...baseInput, plan: "starter", lastName: blank, firstName: blank },
          { userRepo, accountGateway }
        );

        await expect(promise).rejects.toThrow(
          MissingRequiredProfileFieldsError
        );
        await expect(promise).rejects.toMatchObject({
          fields: ["lastName", "firstName"],
        });
        expect(userRepo.saveIfNotOnboarded).not.toHaveBeenCalled();
        expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
      }
    );

    it("電話番号が空白だけの場合はphoneNumberを不足項目にする", async () => {
      const userRepo = makeUserRepo();
      vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
      const accountGateway = makeAccountGateway();

      await expect(
        selectPlan(
          { ...baseInput, plan: "starter", phoneNumber: " " },
          { userRepo, accountGateway }
        )
      ).rejects.toMatchObject({ fields: ["phoneNumber"] });
      expect(userRepo.saveIfNotOnboarded).not.toHaveBeenCalled();
    });

    it("名だけが空白の場合はfirstNameだけを不足項目にする", async () => {
      const userRepo = makeUserRepo();
      vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
      const accountGateway = makeAccountGateway();

      await expect(
        selectPlan(
          { ...baseInput, plan: "starter", firstName: "  " },
          { userRepo, accountGateway }
        )
      ).rejects.toMatchObject({ fields: ["firstName"] });
    });

    it.each([
      ["空", ""],
      ["空白だけ", "\u3000"],
    ])(
      "法人の会社名・インボイス番号が%sの場合はMissingRequiredProfileFieldsErrorをthrowし、保存しない",
      async (_, blank) => {
        const userRepo = makeUserRepo();
        vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
        const accountGateway = makeAccountGateway();

        await expect(
          selectPlan(
            {
              ...baseInput,
              plan: "advanced",
              companyName: blank,
              invoiceRegistrationNumber: blank,
            },
            { userRepo, accountGateway }
          )
        ).rejects.toMatchObject({
          fields: ["companyName", "invoiceRegistrationNumber"],
        });
        expect(userRepo.saveIfNotOnboarded).not.toHaveBeenCalled();
      }
    );

    it("氏名・会社名は前後の空白を除いて保存する", async () => {
      const userRepo = makeUserRepo();
      vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
      const accountGateway = makeAccountGateway();

      await selectPlan(
        {
          ...baseInput,
          plan: "advanced",
          lastName: " 山田 ",
          firstName: "\u3000太郎",
          companyName: " テスト株式会社 ",
          invoiceRegistrationNumber: "T1234567890123",
        },
        { userRepo, accountGateway }
      );

      const saved = vi.mocked(userRepo.saveIfNotOnboarded).mock.calls[0][0];
      expect(saved.lastName).toBe("山田");
      expect(saved.firstName).toBe("太郎");
      expect(saved.companyName).toBe("テスト株式会社");
    });
  });
});
