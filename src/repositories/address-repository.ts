import type { Address } from "@/domain/entities/address";

export interface AddressRepository {
  findById(id: string): Promise<Address | null>;
  findByUserId(userId: string): Promise<Address[]>;
}
