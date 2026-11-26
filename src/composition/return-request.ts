import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseReturnRepository } from "@/infrastructure/supabase/supabase-return-repository";
import {
  requestReturn as requestReturnUseCase,
  type RequestReturnInput,
} from "@/use-cases/request-return";

// 会員のクライアント（RLS）で組み立てる。他の会員の注文は RLS により見えず、use-case の
// 「注文が見つかりません」で止まる。申請の保存も RLS が本人の注文・その注文の明細に限る（最後の防壁）
export async function requestReturn(input: RequestReturnInput) {
  const supabase = await createServerClient();
  return requestReturnUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    orderRepo: new SupabaseOrderRepository(supabase),
    returnRepo: new SupabaseReturnRepository(supabase),
  });
}
