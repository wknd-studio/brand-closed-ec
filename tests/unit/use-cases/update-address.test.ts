import { describe, it, expect, vi } from "vitest";
import { updateAddress } from "@/use-cases/update-address";
import { makeAddressRepo } from "./helpers";

const baseInput = {
  addressId: "shipping-addr",
  recipientLastName: "鈴木",
  recipientFirstName: "花子",
  postalCode: "200-0001",
  prefecture: "神奈川県",
  city: "横浜市",
  addressLine1: "横浜1-1",
  addressLine2: null,
  phoneNumber: "08011112222",
};

describe("updateAddress", () => {
  it("住所が見つからない場合はエラーをthrowする", async () => {
    const addressRepo = makeAddressRepo();
    vi.mocked(addressRepo.findById).mockResolvedValue(null);

    await expect(updateAddress(baseInput, { addressRepo })).rejects.toThrow(
      "住所が見つかりません"
    );
  });

  it("既存住所のフィールドを更新してsaveする", async () => {
    const addressRepo = makeAddressRepo();

    await updateAddress(baseInput, { addressRepo });

    const updated = vi.mocked(addressRepo.update).mock.calls[0][0];
    expect(updated.id).toBe("shipping-addr");
  });
});
