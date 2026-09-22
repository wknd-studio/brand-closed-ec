import { describe, it, expect, vi } from "vitest";
import { selectPlan } from "@/use-cases/select-plan";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
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

    expect(result).toEqual({ redirectTo: "/onboarding/payment?plan=starter" });
    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
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
    const existingUser = makeUser({ rank: "starter" });
    const userRepo = makeUserRepo(existingUser);
    const accountGateway = makeAccountGateway();

    await selectPlan(
      { ...baseInput, plan: "standard" },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.id).toBe(existingUser.id);
    expect(saved.rank.value).toBe("standard");
    expect(saved.firstName).toBe("太郎");
    expect(saved.lastName).toBe("山田");
    expect(saved.phoneNumber).toBe("09012345678");
  });

  it("電話番号の形式が不正な場合はInvalidPhoneNumberErrorをthrowする", async () => {
    const userRepo = makeUserRepo();
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

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
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

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.memberType.value).toBe("individual");
    expect(saved.companyName).toBeNull();
    expect(saved.invoiceRegistrationNumber).toBeNull();
  });

  it("不正な形式のインボイス番号はInvalidInvoiceRegistrationNumberErrorをthrowする", async () => {
    const userRepo = makeUserRepo();
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
});
