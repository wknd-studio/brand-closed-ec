import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseReturnRepository } from "@/infrastructure/supabase/supabase-return-repository";
import { SupabaseAdminUserRepository } from "@/infrastructure/supabase/supabase-admin-user-repository";
import { SupabaseAdminReturnQueryService } from "@/infrastructure/supabase/supabase-admin-return-query-service";
import type { AdminReturnQueryService } from "@/queries/admin-return-query-service";
import { approveReturn as approveReturnUseCase } from "@/use-cases/approve-return";
import { rejectReturn as rejectReturnUseCase } from "@/use-cases/reject-return";
import type { ReviewReturnInput } from "@/use-cases/review-return";
import {
  updateReturnAdminNote as updateReturnAdminNoteUseCase,
  type UpdateReturnAdminNoteInput,
} from "@/use-cases/update-return-admin-note";

// 運営者の操作のため admin を使う（承認・却下・運営メモの書き込みは会員のロールに権限が無い）。
// 権限は admin の layout・サーバーアクションで確かめる
export function approveReturn(input: ReviewReturnInput) {
  const supabase = createAdminClient();
  return approveReturnUseCase(input, {
    returnRepo: new SupabaseReturnRepository(supabase),
    adminUserRepo: new SupabaseAdminUserRepository(supabase),
  });
}

export function rejectReturn(input: ReviewReturnInput) {
  const supabase = createAdminClient();
  return rejectReturnUseCase(input, {
    returnRepo: new SupabaseReturnRepository(supabase),
    adminUserRepo: new SupabaseAdminUserRepository(supabase),
  });
}

export function updateReturnAdminNote(input: UpdateReturnAdminNoteInput) {
  return updateReturnAdminNoteUseCase(input, {
    returnRepo: new SupabaseReturnRepository(createAdminClient()),
  });
}

export function adminReturnQueryService(): AdminReturnQueryService {
  return new SupabaseAdminReturnQueryService(createAdminClient());
}
