import { AdminUser } from "@/domain/entities/admin-user";
import { AdminMembership } from "@/domain/entities/admin-membership";
import type { AdminUserRepository } from "@/repositories/admin-user-repository";
import type { AdminMembershipRepository } from "@/repositories/admin-membership-repository";

export type SyncAdminMembershipInput = {
  clerkUserId: string;
  name: string;
  email: string;
  clerkRole: string;
};

export type SyncAdminMembershipDeps = {
  adminUserRepo: AdminUserRepository;
  adminMembershipRepo: AdminMembershipRepository;
};

export async function syncAdminMembership(
  input: SyncAdminMembershipInput,
  deps: SyncAdminMembershipDeps
): Promise<void> {
  const now = new Date();

  const existingAdminUser = await deps.adminUserRepo.findByClerkUserId(
    input.clerkUserId
  );
  const adminUser = AdminUser.of({
    id: existingAdminUser?.id ?? crypto.randomUUID(),
    clerkUserId: input.clerkUserId,
    name: input.name,
    email: input.email,
    createdAt: existingAdminUser?.createdAt ?? now,
  });
  await deps.adminUserRepo.save(adminUser);

  const existingMembership = await deps.adminMembershipRepo.findByAdminUserId(
    adminUser.id
  );
  const membership = AdminMembership.of({
    id: existingMembership?.id ?? crypto.randomUUID(),
    adminUserId: adminUser.id,
    clerkRole: input.clerkRole,
    createdAt: existingMembership?.createdAt ?? now,
    updatedAt: now,
  });
  await deps.adminMembershipRepo.save(membership);
}
