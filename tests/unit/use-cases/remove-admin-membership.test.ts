import { describe, it, expect } from "vitest";
import { removeAdminMembership } from "@/use-cases/remove-admin-membership";
import {
  makeAdminUser,
  makeAdminUserRepo,
  makeAdminMembershipRepo,
} from "./helpers";

describe("removeAdminMembership", () => {
  it("該当するadmin_userのadmin_membershipを削除する", async () => {
    const adminUser = makeAdminUser();
    const adminUserRepo = makeAdminUserRepo(adminUser);
    const adminMembershipRepo = makeAdminMembershipRepo(null);

    await removeAdminMembership(
      { clerkUserId: adminUser.clerkUserId },
      { adminUserRepo, adminMembershipRepo }
    );

    expect(adminMembershipRepo.deleteByAdminUserId).toHaveBeenCalledWith(
      adminUser.id
    );
  });

  it("該当するadmin_userが存在しない場合は何もしない", async () => {
    const adminUserRepo = makeAdminUserRepo(null);
    const adminMembershipRepo = makeAdminMembershipRepo(null);

    await removeAdminMembership(
      { clerkUserId: "clerk_unknown" },
      { adminUserRepo, adminMembershipRepo }
    );

    expect(adminMembershipRepo.deleteByAdminUserId).not.toHaveBeenCalled();
  });
});
