import { describe, it, expect, vi } from "vitest";
import { deleteAddress } from "@/use-cases/delete-address";
import { makeAddressRepo } from "./helpers";

describe("deleteAddress", () => {
  it("住所が見つからない場合はエラーをthrowする", async () => {
    const addressRepo = makeAddressRepo();
    vi.mocked(addressRepo.findById).mockResolvedValue(null);

    await expect(
      deleteAddress({ addressId: "addr-1" }, { addressRepo })
    ).rejects.toThrow("住所が見つかりません");
  });

  it("addressRepo.deleteを呼ぶ", async () => {
    const addressRepo = makeAddressRepo();

    await deleteAddress({ addressId: "shipping-addr" }, { addressRepo });

    expect(addressRepo.delete).toHaveBeenCalledWith("shipping-addr");
  });
});
