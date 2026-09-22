import { describe, it, expect, vi } from "vitest";
import { syncAdminMembership } from "@/use-cases/sync-admin-membership";
import {
  makeAdminUser,
  makeAdminMembership,
  makeAdminUserRepo,
  makeAdminMembershipRepo,
} from "./helpers";

describe("syncAdminMembership", () => {
  it("未登録のClerkユーザーなら新規admin_user/admin_membershipを作成する", async () => {
    const adminUserRepo = makeAdminUserRepo(null);
    const adminMembershipRepo = makeAdminMembershipRepo(null);

    await syncAdminMembership(
      {
        clerkUserId: "clerk_admin_new",
        name: "新任 花子",
        email: "new@example.com",
        clerkRole: "org:order_manager",
      },
      { adminUserRepo, adminMembershipRepo }
    );

    expect(adminUserRepo.save).toHaveBeenCalledTimes(1);
    const savedUser = vi.mocked(adminUserRepo.save).mock.calls[0][0];
    expect(savedUser.clerkUserId).toBe("clerk_admin_new");
    expect(savedUser.name).toBe("新任 花子");
    expect(savedUser.id).toBeTruthy();

    expect(adminMembershipRepo.save).toHaveBeenCalledTimes(1);
    const savedMembership = vi.mocked(adminMembershipRepo.save).mock
      .calls[0][0];
    expect(savedMembership.adminUserId).toBe(savedUser.id);
    expect(savedMembership.clerkRole).toBe("org:order_manager");
  });

  it("既存のadmin_userのロール変更では、同じid・同じcreatedAtのまま更新する", async () => {
    const existingUser = makeAdminUser();
    const existingMembership = makeAdminMembership({
      adminUserId: existingUser.id,
      clerkRole: "org:order_manager",
    });
    const adminUserRepo = makeAdminUserRepo(existingUser);
    const adminMembershipRepo = makeAdminMembershipRepo(existingMembership);

    await syncAdminMembership(
      {
        clerkUserId: existingUser.clerkUserId,
        name: existingUser.name,
        email: existingUser.email,
        clerkRole: "org:admin",
      },
      { adminUserRepo, adminMembershipRepo }
    );

    const savedUser = vi.mocked(adminUserRepo.save).mock.calls[0][0];
    expect(savedUser.id).toBe(existingUser.id);
    expect(savedUser.createdAt).toEqual(existingUser.createdAt);

    const savedMembership = vi.mocked(adminMembershipRepo.save).mock
      .calls[0][0];
    expect(savedMembership.id).toBe(existingMembership.id);
    expect(savedMembership.clerkRole).toBe("org:admin");
    expect(savedMembership.createdAt).toEqual(existingMembership.createdAt);
  });
});
