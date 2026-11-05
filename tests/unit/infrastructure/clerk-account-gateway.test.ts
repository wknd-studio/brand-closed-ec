import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";

const updateUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { updateUser } })),
}));

import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";

function clerkError(status: number) {
  return new ClerkAPIResponseError("error", {
    data: [],
    status,
  });
}

// GitHub issue #530
describe("ClerkAccountGateway.disableSelfDelete", () => {
  beforeEach(() => {
    updateUser.mockReset();
  });

  it("ClerkユーザーをdeleteSelfEnabled: falseに更新する", async () => {
    updateUser.mockResolvedValue({});

    await new ClerkAccountGateway().disableSelfDelete("user_1");

    expect(updateUser).toHaveBeenCalledWith("user_1", {
      deleteSelfEnabled: false,
    });
  });

  // Webhookの処理より先にユーザーが削除されていたら、無効にする対象が無いので成功扱いにする
  // （失敗扱いにするとsvixの再送が尽きるまで500とSentry通知が続く）
  it("ユーザーが存在しない（404）ときは何もせず終わる", async () => {
    updateUser.mockRejectedValue(clerkError(404));

    await expect(
      new ClerkAccountGateway().disableSelfDelete("user_1")
    ).resolves.toBeUndefined();
  });

  it("404以外のエラーは呼び出し元に伝える", async () => {
    const err = clerkError(500);
    updateUser.mockRejectedValue(err);

    await expect(
      new ClerkAccountGateway().disableSelfDelete("user_1")
    ).rejects.toBe(err);
  });
});
