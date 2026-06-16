import { Address } from "@/domain/entities/address";
import type { AddressType } from "@/domain/entities/address";
import type { UserRepository } from "@/repositories/user-repository";
import type { AddressRepository } from "@/repositories/address-repository";

export type CreateAddressInput = {
  clerkUserId: string;
  type: AddressType;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  phoneNumber: string;
};

export type CreateAddressDeps = {
  userRepo: UserRepository;
  addressRepo: AddressRepository;
};

export async function createAddress(
  input: CreateAddressInput,
  deps: CreateAddressDeps
): Promise<void> {
  const { userRepo, addressRepo } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const count = await addressRepo.countByUserIdAndType(user.id, input.type);
  const isDefault = count === 0;

  const address = Address.of({
    id: crypto.randomUUID(),
    type: input.type,
    isDefault,
    recipientLastName: input.recipientLastName,
    recipientFirstName: input.recipientFirstName,
    postalCode: input.postalCode,
    prefecture: input.prefecture,
    city: input.city,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? "",
    phoneNumber: input.phoneNumber,
  });

  await addressRepo.save(address, user.id);
}
