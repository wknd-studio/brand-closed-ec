import type { AddressRepository } from "@/repositories/address-repository";

export type UpdateAddressInput = {
  addressId: string;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  phoneNumber: string;
};

export type UpdateAddressDeps = {
  addressRepo: AddressRepository;
};

export async function updateAddress(
  input: UpdateAddressInput,
  deps: UpdateAddressDeps
): Promise<void> {
  const { addressRepo } = deps;

  const address = await addressRepo.findById(input.addressId);
  if (!address) throw new Error("住所が見つかりません");

  const updated = address.with({
    recipientLastName: input.recipientLastName,
    recipientFirstName: input.recipientFirstName,
    postalCode: input.postalCode,
    prefecture: input.prefecture,
    city: input.city,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? "",
    phoneNumber: input.phoneNumber,
  });

  await addressRepo.update(updated);
}
