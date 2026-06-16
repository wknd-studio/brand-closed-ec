import type { AddressRepository } from "@/repositories/address-repository";

export type DeleteAddressInput = {
  addressId: string;
};

export type DeleteAddressDeps = {
  addressRepo: AddressRepository;
};

export async function deleteAddress(
  input: DeleteAddressInput,
  deps: DeleteAddressDeps
): Promise<void> {
  const { addressRepo } = deps;

  const address = await addressRepo.findById(input.addressId);
  if (!address) throw new Error("住所が見つかりません");

  await addressRepo.delete(input.addressId);
}
