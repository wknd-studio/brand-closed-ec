import { describe, it, expect, vi } from "vitest";
import { approveReturn } from "@/use-cases/approve-return";
import { rejectReturn } from "@/use-cases/reject-return";
import {
  reconstituteReturnRequest,
  type ReturnStatus,
} from "@/domain/entities/return-request";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";
import { ReturnConcurrentlyModifiedError } from "@/domain/errors/return-concurrently-modified-error";
import type { ReturnRepository } from "@/repositories/return-repository";
import { makeAdminUser, makeAdminUserRepo } from "./helpers";

// 運営者による返品申請の承認・却下（#383）

const RETURN_ID = "00000000-0000-0000-0000-000000000401";
const ADMIN_CLERK_USER_ID = "clerk_admin_1";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000301";

function makeReturn(status: ReturnStatus = "requested") {
  return reconstituteReturnRequest({
    id: RETURN_ID,
    orderId: "00000000-0000-0000-0000-000000000001",
    status,
    requestedByUserId: "00000000-0000-0000-0000-000000000002",
    reason: "不良品: 割れていた",
    items: [
      { orderItemId: "00000000-0000-0000-0000-000000000031", quantity: 1 },
    ],
    approvedAt: null,
  });
}

function makeReturnRepo(
  found: ReturnType<typeof makeReturn> | null,
  { updated = true }: { updated?: boolean } = {}
): ReturnRepository {
  return {
    findByOrderId: vi.fn(),
    saveAll: vi.fn(),
    findById: vi.fn().mockResolvedValue(found),
    saveReview: vi.fn().mockResolvedValue(updated),
    updateAdminNote: vi.fn(),
  };
}

const input = {
  returnId: RETURN_ID,
  adminClerkUserId: ADMIN_CLERK_USER_ID,
  adminNote: "  着払いで返送を依頼  ",
};

describe.each([
  { name: "approveReturn", run: approveReturn, toStatus: "approved" },
  { name: "rejectReturn", run: rejectReturn, toStatus: "rejected" },
])("$name", ({ run, toStatus }) => {
  it(`requested の申請を ${toStatus} にし、確認した運営者と前後の空白を除いたメモを一緒に保存する`, async () => {
    const returnRepo = makeReturnRepo(makeReturn());
    const adminUserRepo = makeAdminUserRepo(
      makeAdminUser({ id: ADMIN_USER_ID })
    );

    await run(input, { returnRepo, adminUserRepo });

    expect(returnRepo.findById).toHaveBeenCalledWith(RETURN_ID);
    expect(adminUserRepo.findByClerkUserId).toHaveBeenCalledWith(
      ADMIN_CLERK_USER_ID
    );
    const [saved, review] = vi.mocked(returnRepo.saveReview).mock.calls[0]!;
    expect(saved.id).toBe(RETURN_ID);
    expect(saved.status).toBe(toStatus);
    expect(review).toEqual({
      adminUserId: ADMIN_USER_ID,
      adminNote: "着払いで返送を依頼",
    });
  });

  it("メモが空白だけなら、メモなし（null）として保存する", async () => {
    const returnRepo = makeReturnRepo(makeReturn());

    await run(
      { ...input, adminNote: "   " },
      {
        returnRepo,
        adminUserRepo: makeAdminUserRepo(makeAdminUser({ id: ADMIN_USER_ID })),
      }
    );

    expect(vi.mocked(returnRepo.saveReview).mock.calls[0]![1]).toEqual({
      adminUserId: ADMIN_USER_ID,
      adminNote: null,
    });
  });

  it("読んだ時点で requested でない申請は、保存せずに状態遷移のエラーを投げる", async () => {
    const returnRepo = makeReturnRepo(makeReturn("cancelled"));

    await expect(
      run(input, {
        returnRepo,
        adminUserRepo: makeAdminUserRepo(makeAdminUser()),
      })
    ).rejects.toThrow(InvalidStatusTransitionError);
    expect(returnRepo.saveReview).not.toHaveBeenCalled();
  });

  it("読んでから保存するまでの間に顧客が取り消していた（条件付き更新で1行も変わらなかった）ときは、同時に変更されたエラーを投げる", async () => {
    // 読んだ時点では requested だが、DB上はすでに cancelled のため status='requested' の条件で更新されない
    const returnRepo = makeReturnRepo(makeReturn(), { updated: false });

    await expect(
      run(input, {
        returnRepo,
        adminUserRepo: makeAdminUserRepo(makeAdminUser()),
      })
    ).rejects.toThrow(ReturnConcurrentlyModifiedError);
    expect(returnRepo.saveReview).toHaveBeenCalledTimes(1);
  });

  it("申請が見つからなければ、保存せずにエラーを投げる", async () => {
    const returnRepo = makeReturnRepo(null);

    await expect(
      run(input, {
        returnRepo,
        adminUserRepo: makeAdminUserRepo(makeAdminUser()),
      })
    ).rejects.toThrow("返品申請が見つかりません");
    expect(returnRepo.saveReview).not.toHaveBeenCalled();
  });

  it("admin_users の行が無い運営者には、確認した人を残せないため操作させない", async () => {
    const returnRepo = makeReturnRepo(makeReturn());

    await expect(
      run(input, { returnRepo, adminUserRepo: makeAdminUserRepo(null) })
    ).rejects.toThrow("運営者が見つかりません");
    expect(returnRepo.saveReview).not.toHaveBeenCalled();
  });
});
