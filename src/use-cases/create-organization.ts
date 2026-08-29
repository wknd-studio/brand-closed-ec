import { Organization } from "@/domain/entities/organization";
import { OrganizationMembership } from "@/domain/entities/organization-membership";
import { User } from "@/domain/entities/user";
import { Address } from "@/domain/entities/address";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import type { OrganizationRepository } from "@/repositories/organization-repository";
import type { OrganizationMembershipRepository } from "@/repositories/organization-membership-repository";
import type { OrganizationGateway } from "@/repositories/organization-gateway";
import type { UserRepository } from "@/repositories/user-repository";
import type { AddressRepository } from "@/repositories/address-repository";

const INVOICE_REGISTRATION_NUMBER_PATTERN = /^T\d{13}$/;

export type CreateOrganizationInput = {
  clerkUserId: string;
  // Clerkのuser.createdウェブフックがまだ届いていない場合に、usersレコードを
  // 新規作成するために使う（法人登録は個人のselectPlanを経由しないため、
  // 既存の個人フローと違ってusersレコードが存在しない状態で呼ばれ得る）
  email: string;
  organizationName: string;
  representativeLastName: string;
  representativeFirstName: string;
  phoneNumber: string;
  address: {
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine1: string;
    addressLine2?: string;
  };
  invoiceRegistrationNumber: string;
};

export type CreateOrganizationDeps = {
  organizationRepo: OrganizationRepository;
  membershipRepo: OrganizationMembershipRepository;
  organizationGateway: OrganizationGateway;
  userRepo: UserRepository;
  addressRepo: AddressRepository;
};

export type CreateOrganizationResult =
  | { type: "created"; organizationId: string }
  | {
      type: "error";
      reason: "duplicate_name" | "invalid_invoice_registration_number";
    };

export async function createOrganization(
  input: CreateOrganizationInput,
  deps: CreateOrganizationDeps
): Promise<CreateOrganizationResult> {
  const {
    organizationRepo,
    membershipRepo,
    organizationGateway,
    userRepo,
    addressRepo,
  } = deps;

  if (
    !INVOICE_REGISTRATION_NUMBER_PATTERN.test(input.invoiceRegistrationNumber)
  ) {
    throw new InvalidInvoiceRegistrationNumberError(
      input.invoiceRegistrationNumber
    );
  }

  const phoneNumber = PhoneNumber.of(input.phoneNumber);

  const existing = await organizationRepo.findByName(input.organizationName);
  if (existing) {
    return { type: "error", reason: "duplicate_name" };
  }

  // 代表者はセルフサインアップした本人であるため、ここで入力された代表者名・
  // 電話番号を、本人のusers.firstName/lastName/phoneNumberにもそのまま反映する
  // （/profile/complete等の別画面での二重入力を避けるための設計）
  let user = await userRepo.findByClerkUserId(input.clerkUserId);
  user = user
    ? user.with({
        firstName: input.representativeFirstName,
        lastName: input.representativeLastName,
        phoneNumber: phoneNumber.value,
      })
    : User.of({
        id: crypto.randomUUID(),
        clerkUserId: input.clerkUserId,
        email: input.email,
        firstName: input.representativeFirstName,
        lastName: input.representativeLastName,
        phoneNumber: phoneNumber.value,
        profileCompletedAt: null,
        rank: MemberRank.of("starter"),
        billingAnchorDay: null,
        onboardingCompleted: false,
        deletedAt: null,
        stripeCustomerId: null,
      });
  await userRepo.save(user);

  const { clerkOrgId } = await organizationGateway.createOrganization({
    name: input.organizationName,
    createdByClerkUserId: input.clerkUserId,
  });

  const organization = Organization.of({
    id: crypto.randomUUID(),
    clerkOrgId,
    name: input.organizationName,
    representativeName: `${input.representativeLastName}${input.representativeFirstName}`,
    phoneNumber: phoneNumber.value,
    invoiceRegistrationNumber: input.invoiceRegistrationNumber,
    onboardingCompleted: false,
    rank: MemberRank.of("starter"),
    billingAnchorDay: null,
    stripeCustomerId: null,
    initialFeePaidRank: null,
    deletedAt: null,
  });
  await organizationRepo.save(organization);

  // 本店所在地はaddresses（type='headquarters'）に統合済み（docs/db-schema-redesign.md
  // 移行方針5番）。1組織1件の部分UNIQUE制約があるため、代表者本人をuser_idとして登録する
  const headquartersAddress = Address.of({
    id: crypto.randomUUID(),
    type: "headquarters",
    isDefault: true,
    recipientLastName: input.representativeLastName,
    recipientFirstName: input.representativeFirstName,
    postalCode: input.address.postalCode,
    prefecture: input.address.prefecture,
    city: input.address.city,
    addressLine1: input.address.addressLine1,
    addressLine2: input.address.addressLine2 ?? "",
    phoneNumber: phoneNumber.value,
  });
  await addressRepo.save(headquartersAddress, user.id, organization.id);

  const membership = OrganizationMembership.of({
    id: crypto.randomUUID(),
    organizationId: organization.id,
    userId: user.id,
    clerkRole: "org:admin",
    createdAt: new Date(),
  });
  await membershipRepo.save(membership);

  return { type: "created", organizationId: organization.id };
}
