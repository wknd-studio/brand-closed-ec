import { Organization } from "@/domain/entities/organization";
import { OrganizationMembership } from "@/domain/entities/organization-membership";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";
import type { OrganizationRepository } from "@/repositories/organization-repository";
import type { OrganizationMembershipRepository } from "@/repositories/organization-membership-repository";
import type { OrganizationGateway } from "@/repositories/organization-gateway";
import type { UserRepository } from "@/repositories/user-repository";

const INVOICE_REGISTRATION_NUMBER_PATTERN = /^T\d{13}$/;

export type CreateOrganizationInput = {
  clerkUserId: string;
  // Clerkのuser.createdウェブフックがまだ届いていない場合に、usersレコードを
  // 新規作成するために使う（法人登録は個人のselectPlanを経由しないため、
  // 既存の個人フローと違ってusersレコードが存在しない状態で呼ばれ得る）
  email: string;
  organizationName: string;
  representativeName: string;
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
  const { organizationRepo, membershipRepo, organizationGateway, userRepo } =
    deps;

  if (
    !INVOICE_REGISTRATION_NUMBER_PATTERN.test(input.invoiceRegistrationNumber)
  ) {
    throw new InvalidInvoiceRegistrationNumberError(
      input.invoiceRegistrationNumber
    );
  }

  const existing = await organizationRepo.findByName(input.organizationName);
  if (existing) {
    return { type: "error", reason: "duplicate_name" };
  }

  let user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) {
    user = User.of({
      id: crypto.randomUUID(),
      clerkUserId: input.clerkUserId,
      email: input.email,
      firstName: "",
      lastName: "",
      phoneNumber: "",
      profileCompletedAt: null,
      rank: MemberRank.of("starter"),
      subscribedAt: null,
      onboardingCompleted: false,
      termsAgreedAt: null,
      termsVersion: null,
      deletedAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    await userRepo.save(user);
  }

  const { clerkOrgId } = await organizationGateway.createOrganization({
    name: input.organizationName,
    createdByClerkUserId: input.clerkUserId,
  });

  const organization = Organization.of({
    id: crypto.randomUUID(),
    clerkOrgId,
    name: input.organizationName,
    representativeName: input.representativeName,
    phoneNumber: input.phoneNumber,
    postalCode: input.address.postalCode,
    prefecture: input.address.prefecture,
    city: input.address.city,
    addressLine1: input.address.addressLine1,
    addressLine2: input.address.addressLine2 ?? null,
    invoiceRegistrationNumber: input.invoiceRegistrationNumber,
    onboardingCompleted: false,
    rank: MemberRank.of("starter"),
    billingAnchorDay: null,
    pendingRank: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeSubscriptionScheduleId: null,
    initialFeePaidRank: null,
    deletedAt: null,
  });
  await organizationRepo.save(organization);

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
