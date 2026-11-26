"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// Clerkの読み込み前のsignOutは何もしないため、読み込むまで押せなくする
export function SignOutButton() {
  const { signOut } = useClerk();
  const { isLoaded } = useAuth();

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => signOut({ redirectUrl: "/" })}
      disabled={!isLoaded}
      className="gap-2 self-center bg-white"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
        <path d="M10 16l-4-4 4-4" />
        <path d="M6 12h10" />
      </svg>
      ログアウト
    </Button>
  );
}
