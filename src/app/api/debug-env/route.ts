import { NextResponse } from "next/server";

// デバッグ調査用（CI原因究明のため一時的に追加。原因判明後に削除する）
export async function GET() {
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}
