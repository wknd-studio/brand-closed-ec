import { describe, it, expect, vi } from "vitest";
import { createOrganization } from "@/use-cases/create-organization";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
import {
  makeUserRepo,
  makeOrganizationRepo,
  makeOrganizationMembershipRepo,
  makeOrganizationGateway,
  makeOrganization,
} from "./helpers";

function baseInput() {
  return {
    clerkUserId: "clerk-1",
    email: "test@example.com",
    legalAcceptedAt: new Date(2026, 0, 1),
    organizationName: "株式会社テスト",
    representativeName: "山田太郎",
    phoneNumber: "0312345678",
    address: {
      postalCode: "1000001",
      prefecture: "東京都",
      city: "千代田区",
      addressLine1: "1-1-1",
    },
    invoiceRegistrationNumber: "T1234567890123",
  };
}

describe("createOrganization", () => {
  it("正常な入力で組織を作成し、作成者をorg:adminとして登録する", async () => {
    const organizationRepo = makeOrganizationRepo();
    const membershipRepo = makeOrganizationMembershipRepo();
    const organizationGateway = makeOrganizationGateway();
    const userRepo = makeUserRepo();

    const result = await createOrganization(baseInput(), {
      organizationRepo,
      membershipRepo,
      organizationGateway,
      userRepo,
    });

    expect(result.type).toBe("created");
    expect(organizationGateway.createOrganization).toHaveBeenCalledWith({
      name: "株式会社テスト",
      createdByClerkUserId: "clerk-1",
    });
    expect(organizationRepo.save).toHaveBeenCalled();
    expect(membershipRepo.save).toHaveBeenCalled();
    const savedMembership = (membershipRepo.save as ReturnType<typeof vi.fn>)
      .mock.calls[0][0];
    expect(savedMembership.clerkRole).toBe("org:admin");
  });

  it("不正な形式のインボイス番号はInvalidInvoiceRegistrationNumberErrorになる", async () => {
    const input = { ...baseInput(), invoiceRegistrationNumber: "invalid" };

    await expect(
      createOrganization(input, {
        organizationRepo: makeOrganizationRepo(),
        membershipRepo: makeOrganizationMembershipRepo(),
        organizationGateway: makeOrganizationGateway(),
        userRepo: makeUserRepo(),
      })
    ).rejects.toThrow(InvalidInvoiceRegistrationNumberError);
  });

  it("同名の組織が既に存在する場合はduplicate_nameエラーになる", async () => {
    const organizationRepo = makeOrganizationRepo();
    organizationRepo.findByName = async () => makeOrganization();

    const result = await createOrganization(baseInput(), {
      organizationRepo,
      membershipRepo: makeOrganizationMembershipRepo(),
      organizationGateway: makeOrganizationGateway(),
      userRepo: makeUserRepo(),
    });

    expect(result).toEqual({ type: "error", reason: "duplicate_name" });
  });

  it("usersレコードが未作成の場合（webhook未到達）でも新規作成して組織を作成する", async () => {
    const organizationRepo = makeOrganizationRepo();
    const membershipRepo = makeOrganizationMembershipRepo();
    const organizationGateway = makeOrganizationGateway();
    const userRepo = makeUserRepo();
    userRepo.findByClerkUserId = async () => null;

    const result = await createOrganization(baseInput(), {
      organizationRepo,
      membershipRepo,
      organizationGateway,
      userRepo,
    });

    expect(result.type).toBe("created");
    expect(userRepo.save).toHaveBeenCalled();
    const savedUser = (userRepo.save as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(savedUser.clerkUserId).toBe("clerk-1");
    expect(savedUser.email).toBe("test@example.com");
  });
});
