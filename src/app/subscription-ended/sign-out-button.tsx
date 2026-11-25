"use client";

import { useAuth, useClerk } from "@clerk/nextjs";

// Clerkの読み込み前のsignOutは何もしないため、読み込むまで押せなくする
export function SignOutButton() {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();

  return (
    <button
      onClick={() => signOut({ redirectUrl: "/" })}
      disabled={!isLoaded}
      className="text-sm underline underline-offset-4"
    >
      ログアウト
    </button>
  );
}
