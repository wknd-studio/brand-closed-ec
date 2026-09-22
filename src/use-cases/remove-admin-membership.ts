import type { AdminUserRepository } from "@/repositories/admin-user-repository";
import type { AdminMembershipRepository } from "@/repositories/admin-membership-repository";

export type RemoveAdminMembershipInput = {
  clerkUserId: string;
};

export type RemoveAdminMembershipDeps = {
  adminUserRepo: AdminUserRepository;
  adminMembershipRepo: AdminMembershipRepository;
};

export async function removeAdminMembership(
  input: RemoveAdminMembershipInput,
  deps: RemoveAdminMembershipDeps
): Promise<void> {
  const adminUser = await deps.adminUserRepo.findByClerkUserId(
    input.clerkUserId
  );
  if (!adminUser) return;

  await deps.adminMembershipRepo.deleteByAdminUserId(adminUser.id);
}
