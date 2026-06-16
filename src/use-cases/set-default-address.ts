import type { AddressType } from "@/domain/entities/address";
import type { UserRepository } from "@/repositories/user-repository";
import type { AddressRepository } from "@/repositories/address-repository";

export type SetDefaultAddressInput = {
  clerkUserId: string;
  addressId: string;
  type: AddressType;
};

export type SetDefaultAddressDeps = {
  userRepo: UserRepository;
  addressRepo: AddressRepository;
};

export async function setDefaultAddress(
  input: SetDefaultAddressInput,
  deps: SetDefaultAddressDeps
): Promise<void> {
  const { userRepo, addressRepo } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const address = await addressRepo.findById(input.addressId);
  if (!address) throw new Error("住所が見つかりません");

  await addressRepo.clearDefault(user.id, input.type);
  await addressRepo.update(address.with({ isDefault: true }));
}
