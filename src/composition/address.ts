import { createAdminClient } from "@/infrastructure/supabase/server-admin";
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

export function createAddress(input: CreateAddressInput) {
  const supabase = createAdminClient();
  return createAddressUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    addressRepo: new SupabaseAddressRepository(supabase),
  });
}

export function updateAddress(input: UpdateAddressInput) {
  return updateAddressUseCase(input, {
    addressRepo: new SupabaseAddressRepository(createAdminClient()),
  });
}

export function deleteAddress(input: DeleteAddressInput) {
  return deleteAddressUseCase(input, {
    addressRepo: new SupabaseAddressRepository(createAdminClient()),
  });
}

export function setDefaultAddress(input: SetDefaultAddressInput) {
  const supabase = createAdminClient();
  return setDefaultAddressUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    addressRepo: new SupabaseAddressRepository(supabase),
  });
}
