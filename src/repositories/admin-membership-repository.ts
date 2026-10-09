import type { AdminMembership } from "@/domain/entities/admin-membership";

export interface AdminMembershipRepository {
  findByAdminUserId(adminUserId: string): Promise<AdminMembership | null>;
  save(membership: AdminMembership): Promise<void>;
  deleteByAdminUserId(adminUserId: string): Promise<void>;
}
