import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseAdminUserRepository } from "@/infrastructure/supabase/supabase-admin-user-repository";
import { SupabaseAdminMembershipRepository } from "@/infrastructure/supabase/supabase-admin-membership-repository";
import {
  syncAdminMembership as syncAdminMembershipUseCase,
  type SyncAdminMembershipInput,
} from "@/use-cases/sync-admin-membership";
import {
  removeAdminMembership as removeAdminMembershipUseCase,
  type RemoveAdminMembershipInput,
} from "@/use-cases/remove-admin-membership";

function adminMembershipDeps() {
  const supabase = createAdminClient();
  return {
    adminUserRepo: new SupabaseAdminUserRepository(supabase),
    adminMembershipRepo: new SupabaseAdminMembershipRepository(supabase),
  };
}

export function syncAdminMembership(input: SyncAdminMembershipInput) {
  return syncAdminMembershipUseCase(input, adminMembershipDeps());
}

export function removeAdminMembership(input: RemoveAdminMembershipInput) {
  return removeAdminMembershipUseCase(input, adminMembershipDeps());
}
