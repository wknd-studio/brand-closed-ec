import { describe, it, expect, vi } from "vitest";
import { setDefaultAddress } from "@/use-cases/set-default-address";
import { makeUserRepo, makeAddressRepo } from "./helpers";

describe("setDefaultAddress", () => {
  it("userが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    await expect(
      setDefaultAddress(
        {
          clerkUserId: "clerk-1",
          addressId: "shipping-addr",
          type: "shipping",
        },
        { userRepo, addressRepo: makeAddressRepo() }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("住所が見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    const addressRepo = makeAddressRepo();
    vi.mocked(addressRepo.findById).mockResolvedValue(null);

    await expect(
      setDefaultAddress(
        { clerkUserId: "clerk-1", addressId: "addr-999", type: "shipping" },
        { userRepo, addressRepo }
      )
    ).rejects.toThrow("住所が見つかりません");
  });

  it("clearDefaultを呼んでからisDefault=trueでsaveする", async () => {
    const userRepo = makeUserRepo();
    const addressRepo = makeAddressRepo();

    await setDefaultAddress(
      { clerkUserId: "clerk-1", addressId: "shipping-addr", type: "shipping" },
      { userRepo, addressRepo }
    );

    expect(addressRepo.clearDefault).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      "shipping"
    );
    const updated = vi.mocked(addressRepo.update).mock.calls[0][0];
    expect(updated.isDefault).toBe(true);
  });
});
