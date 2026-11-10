import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AddressRepository } from "@/repositories/address-repository";
import { Address, reconstituteAddress } from "@/domain/entities/address";
import type { AddressType } from "@/domain/entities/address";

type AddressRow = {
  id: string;
  type: string;
  is_default: boolean;
  recipient_last_name: string;
  recipient_first_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line1: string;
  address_line2: string | null;
  phone_number: string;
};

function toAddress(row: AddressRow): Address {
  return reconstituteAddress({
    id: row.id,
    type: row.type as AddressType,
    isDefault: row.is_default,
    recipientLastName: row.recipient_last_name,
    recipientFirstName: row.recipient_first_name,
    postalCode: row.postal_code,
    prefecture: row.prefecture,
    city: row.city,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2 ?? "",
    phoneNumber: row.phone_number,
  });
}

const SELECT_FIELDS =
  "id, type, is_default, recipient_last_name, recipient_first_name, postal_code, prefecture, city, address_line1, address_line2, phone_number";

export class SupabaseAddressRepository implements AddressRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<Address | null> {
    const { data, error } = await this.db
      .from("addresses")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toAddress(data as AddressRow) : null;
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Address | null> {
    const { data, error } = await this.db
      .from("addresses")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? toAddress(data as AddressRow) : null;
  }

  async findByUserId(userId: string): Promise<Address[]> {
    const { data, error } = await this.db
      .from("addresses")
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      .order("is_default", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => toAddress(row as AddressRow));
  }

  async countByUserIdAndType(
    userId: string,
    type: AddressType
  ): Promise<number> {
    const { count, error } = await this.db
      .from("addresses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", type);
    if (error) throw error;
    return count ?? 0;
  }

  async save(address: Address, userId: string): Promise<void> {
    const { error } = await this.db.from("addresses").insert({
      id: address.id,
      user_id: userId,
      type: address.type,
      is_default: address.isDefault,
      recipient_last_name: address.recipientLastName,
      recipient_first_name: address.recipientFirstName,
      postal_code: address.postalCode,
      prefecture: address.prefecture,
      city: address.city,
      address_line1: address.addressLine1,
      address_line2: address.addressLine2 || null,
      phone_number: address.phoneNumber,
    });
    if (error) throw error;
  }

  async update(address: Address): Promise<void> {
    const { error } = await this.db
      .from("addresses")
      .update({
        type: address.type,
        is_default: address.isDefault,
        recipient_last_name: address.recipientLastName,
        recipient_first_name: address.recipientFirstName,
        postal_code: address.postalCode,
        prefecture: address.prefecture,
        city: address.city,
        address_line1: address.addressLine1,
        address_line2: address.addressLine2 || null,
        phone_number: address.phoneNumber,
      })
      .eq("id", address.id);
    if (error) throw error;
  }

  async delete(addressId: string): Promise<void> {
    const { error } = await this.db
      .from("addresses")
      .delete()
      .eq("id", addressId);
    if (error) throw error;
  }

  async clearDefault(userId: string, type: AddressType): Promise<void> {
    const { error } = await this.db
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("type", type);
    if (error) throw error;
  }
}
