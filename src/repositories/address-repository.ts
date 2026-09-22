import type { Address, AddressType } from "@/domain/entities/address";

export interface AddressRepository {
  findById(id: string): Promise<Address | null>;
  findByUserId(userId: string): Promise<Address[]>;
  countByUserIdAndType(userId: string, type: AddressType): Promise<number>;
  save(address: Address, userId: string): Promise<void>;
  update(address: Address): Promise<void>;
  delete(addressId: string): Promise<void>;
  clearDefault(userId: string, type: AddressType): Promise<void>;
}
