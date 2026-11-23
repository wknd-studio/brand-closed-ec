import type { AdminRole } from "@/domain/value-objects/admin-role";

// 運営スタッフの権限判定（src/composition/admin-authorization.ts）で使う、運営のロールの読み取り
export interface AdminRoleQueryService {
  // 運営スタッフの行が無い・ロールが付与されていない・未知のロールなら null
  findRoleByClerkUserId(clerkUserId: string): Promise<AdminRole | null>;
}
