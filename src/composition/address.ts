import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseAddressRepository } from "@/infrastructure/supabase/supabase-address-repository";
import {
  createAddress as createAddressUseCase,
  type CreateAddressInput,
} from "@/use-cases/create-address";
import {
  updateAddress as updateAddressUseCase,
  type UpdateAddressInput,
} from "@/use-cases/update-address";
import {
  deleteAddress as deleteAddressUseCase,
  type DeleteAddressInput,
} from "@/use-cases/delete-address";
import {
  setDefaultAddress as setDefaultAddressUseCase,
  type SetDefaultAddressInput,
} from "@/use-cases/set-default-address";

// 会員のクライアント（RLS）で組み立てる。他の会員の住所は RLS により見えないため、
// 住所IDで指定しても use-case の「住所が見つかりません」で止まる
export async function createAddress(input: CreateAddressInput) {
  const supabase = await createServerClient();
  return createAddressUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    addressRepo: new SupabaseAddressRepository(supabase),
  });
}

export async function updateAddress(input: UpdateAddressInput) {
  return updateAddressUseCase(input, {
    addressRepo: new SupabaseAddressRepository(await createServerClient()),
  });
}

export async function deleteAddress(input: DeleteAddressInput) {
  return deleteAddressUseCase(input, {
    addressRepo: new SupabaseAddressRepository(await createServerClient()),
  });
}

export async function setDefaultAddress(input: SetDefaultAddressInput) {
  const supabase = await createServerClient();
  return setDefaultAddressUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    addressRepo: new SupabaseAddressRepository(supabase),
  });
}
