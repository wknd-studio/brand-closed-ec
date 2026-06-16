import { describe, it, expect, vi } from "vitest";
import { createAddress } from "@/use-cases/create-address";
import { makeUserRepo, makeAddressRepo } from "./helpers";

const baseInput = {
  clerkUserId: "clerk-1",
  type: "shipping" as const,
  recipientLastName: "山田",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "千代田1-1",
  addressLine2: "",
  phoneNumber: "09012345678",
};

describe("createAddress", () => {
  it("userが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    await expect(
      createAddress(baseInput, { userRepo, addressRepo: makeAddressRepo() })
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("同タイプの住所が0件の場合はisDefault=trueで保存する", async () => {
    const userRepo = makeUserRepo();
    const addressRepo = makeAddressRepo();
    vi.mocked(addressRepo.countByUserIdAndType).mockResolvedValue(0);

    await createAddress(baseInput, { userRepo, addressRepo });

    const saved = vi.mocked(addressRepo.save).mock.calls[0][0];
    expect(saved.isDefault).toBe(true);
    expect(saved.type).toBe("shipping");
  });

  it("同タイプの住所が1件以上の場合はisDefault=falseで保存する", async () => {
    const userRepo = makeUserRepo();
    const addressRepo = makeAddressRepo();
    vi.mocked(addressRepo.countByUserIdAndType).mockResolvedValue(1);

    await createAddress(baseInput, { userRepo, addressRepo });

    const saved = vi.mocked(addressRepo.save).mock.calls[0][0];
    expect(saved.isDefault).toBe(false);
  });

  it("addressRepo.saveにsupabase userIdを渡す", async () => {
    const userRepo = makeUserRepo();
    const addressRepo = makeAddressRepo();

    await createAddress(baseInput, { userRepo, addressRepo });

    const [, userId] = vi.mocked(addressRepo.save).mock.calls[0];
    expect(userId).toBe("00000000-0000-0000-0000-000000000001");
  });
});
