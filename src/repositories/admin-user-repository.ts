import type { AdminUser } from "@/domain/entities/admin-user";

export interface AdminUserRepository {
  findByClerkUserId(clerkUserId: string): Promise<AdminUser | null>;
  save(adminUser: AdminUser): Promise<void>;
}
