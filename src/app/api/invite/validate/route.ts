import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { checkInviteCodeRecord } from "@/lib/invite/validate";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code: string = body?.code ?? "";

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invitation_codes")
    .select("id, is_active, expires_at, max_uses, used_count")
    .eq("code", code)
    .single();

  if (error || !data) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }

  const result = checkInviteCodeRecord(data);
  return NextResponse.json(result);
}
