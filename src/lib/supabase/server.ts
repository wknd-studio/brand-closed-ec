import { requireAuth } from "@/lib/auth/current-user";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export async function createServerClient() {
  const { getToken } = await requireAuth();
  const token = await getToken();

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: { persistSession: false },
    }
  );
}
