import { describe, it, expect, vi, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrganizationRepository } from "@/infrastructure/supabase/supabase-organization-repository";
import { SupabaseOrganizationMembershipRepository } from "@/infrastructure/supabase/supabase-organization-membership-repository";
import { createOrganization } from "@/use-cases/create-organization";
import { selectPlan } from "@/use-cases/select-plan";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { OrganizationGateway } from "@/repositories/organization-gateway";
import type { AccountGateway } from "@/repositories/account-gateway";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_CLERK_USER_ID = "clerk_test_org_onboarding";
const TEST_CLERK_ORG_ID = "org_test_onboarding_clerk";

// Clerk Organizations APIは外部サービスのため実DB統合テストではフェイクに差し替える
function makeOrganizationGateway(): OrganizationGateway {
  return {
    createOrganization: vi
      .fn()
      .mockResolvedValue({ clerkOrgId: TEST_CLERK_ORG_ID }),
    inviteMember: vi.fn().mockResolvedValue(undefined),
    deleteOrganization: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAccountGateway(): AccountGateway {
  return {
    deleteUser: vi.fn().mockResolvedValue(undefined),
    updateOnboardingMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

async function cleanup() {
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", TEST_CLERK_ORG_ID)
    .maybeSingle();
  if (org) {
    await supabase
      .from("organization_memberships")
      .delete()
      .eq("organization_id", org.id);
    await supabase.from("organizations").delete().eq("id", org.id);
  }
  await supabase.from("users").delete().eq("clerk_user_id", TEST_CLERK_USER_ID);
}

afterAll(cleanup);

describe("法人組織作成〜プラン選択のオンボーディング（実DB）", () => {
  it("代表者が組織を作成すると組織のadminとして登録され、プラン選択で組織のrankとonboarding_completedが更新される", async () => {
    await cleanup();

    const userRepo = new SupabaseUserRepository(supabase);
    const organizationRepo = new SupabaseOrganizationRepository(supabase);
    const membershipRepo = new SupabaseOrganizationMembershipRepository(
      supabase
    );

    await userRepo.save(
      User.of({
        id: crypto.randomUUID(),
        clerkUserId: TEST_CLERK_USER_ID,
        email: "org-onboarding@example.com",
        firstName: "太郎",
        lastName: "山田",
        phoneNumber: "09012345678",
        profileCompletedAt: new Date(),
        rank: MemberRank.of("starter"),
        subscribedAt: null,
        onboardingCompleted: false,
        termsAgreedAt: null,
        termsVersion: null,
        deletedAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      })
    );

    const createResult = await createOrganization(
      {
        clerkUserId: TEST_CLERK_USER_ID,
        organizationName: "統合テスト株式会社",
        representativeName: "山田太郎",
        phoneNumber: "0312345678",
        address: {
          postalCode: "1000001",
          prefecture: "東京都",
          city: "千代田区",
          addressLine1: "1-1-1",
        },
        invoiceRegistrationNumber: "T1234567890123",
      },
      {
        organizationRepo,
        membershipRepo,
        organizationGateway: makeOrganizationGateway(),
        userRepo,
      }
    );

    expect(createResult.type).toBe("created");
    if (createResult.type !== "created") return;

    const organization = await organizationRepo.findById(
      createResult.organizationId
    );
    expect(organization).not.toBeNull();
    expect(organization!.onboardingCompleted).toBe(false);
    expect(organization!.rank.value).toBe("starter");

    const user = await userRepo.findByClerkUserId(TEST_CLERK_USER_ID);
    const membership = await membershipRepo.findByOrganizationAndUser(
      createResult.organizationId,
      user!.id
    );
    expect(membership).not.toBeNull();
    expect(membership!.clerkRole).toBe("org:admin");

    const planResult = await selectPlan(
      {
        clerkUserId: TEST_CLERK_USER_ID,
        email: "org-onboarding@example.com",
        firstName: "太郎",
        lastName: "山田",
        plan: "advanced",
        termsVersion: "2026-05-25",
        organizationId: createResult.organizationId,
      },
      {
        userRepo,
        accountGateway: makeAccountGateway(),
        organizationRepo,
      }
    );

    expect(planResult).toEqual({ redirectTo: "/" });

    const updatedOrganization = await organizationRepo.findById(
      createResult.organizationId
    );
    expect(updatedOrganization!.rank.value).toBe("advanced");
    expect(updatedOrganization!.onboardingCompleted).toBe(true);

    const updatedUser = await userRepo.findByClerkUserId(TEST_CLERK_USER_ID);
    expect(updatedUser!.onboardingCompleted).toBe(true);
  });
});
